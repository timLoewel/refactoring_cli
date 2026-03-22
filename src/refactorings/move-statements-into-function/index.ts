import { Node } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../engine/refactoring.types.js";
import { defineRefactoring, param, resolve } from "../../engine/refactoring-builder.js";
import type { FunctionContext } from "../../engine/refactoring-builder.js";

export const moveStatementsIntoFunction = defineRefactoring<FunctionContext>({
  name: "Move Statements Into Function",
  kebabName: "move-statements-into-function",
  tier: 2,
  description: "Moves a range of top-level statements into an existing function body.",
  params: [
    param.file(),
    param.identifier("target", "Name of the function to move statements into"),
    param.number("startLine", "First line of statements to move (1-based)"),
    param.number("endLine", "Last line of statements to move (1-based)"),
  ],
  resolve: (project, params) =>
    resolve.function(project, params as { file: string; target: string }),
  preconditions(ctx: FunctionContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const startLine = params["startLine"] as number;
    const endLine = params["endLine"] as number;

    if (endLine < startLine) {
      errors.push("param 'endLine' must be >= 'startLine'");
    }

    const totalLines = ctx.sourceFile.getEndLineNumber();
    if (startLine > totalLines) {
      errors.push(`startLine ${startLine} exceeds file length ${totalLines}`);
    }
    if (endLine > totalLines) {
      errors.push(`endLine ${endLine} exceeds file length ${totalLines}`);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: FunctionContext, params: Record<string, unknown>): RefactoringResult {
    const sf = ctx.sourceFile;
    const file = params["file"] as string;
    const target = params["target"] as string;
    const startLine = params["startLine"] as number;
    const endLine = params["endLine"] as number;
    const { body } = ctx;

    // Find top-level statements in the line range
    const statements = sf.getStatements();
    const toMove = statements.filter((s) => {
      const start = s.getStartLineNumber();
      const end = s.getEndLineNumber();
      return start >= startLine && end <= endLine;
    });

    if (toMove.length === 0) {
      return {
        success: false,
        filesChanged: [],
        description: `No complete statements found between lines ${startLine} and ${endLine}`,
      };
    }

    const movedText = toMove.map((s) => `  ${s.getText()}`).join("\n");

    // Append statements to the function body
    if (!Node.isBlock(body)) {
      return {
        success: false,
        filesChanged: [],
        description: `Function '${target}' body is not a block`,
      };
    }
    body.addStatements(movedText);

    // Remove the statements from the top level (reverse order)
    const sorted = [...toMove].sort((a, b) => b.getStart() - a.getStart());
    for (const stmt of sorted) {
      stmt.remove();
    }

    return {
      success: true,
      filesChanged: [file],
      description: `Moved ${toMove.length} statement(s) from lines ${startLine}-${endLine} into function '${target}'`,
    };
  },
});
