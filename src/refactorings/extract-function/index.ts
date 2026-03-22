import { SyntaxKind } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../engine/refactoring.types.js";
import { defineRefactoring, param, resolve } from "../../engine/refactoring-builder.js";
import type { SourceFileContext } from "../../engine/refactoring-builder.js";

export const extractFunction = defineRefactoring<SourceFileContext>({
  name: "Extract Function",
  kebabName: "extract-function",
  tier: 2,
  description:
    "Extracts a range of lines into a new named function and replaces them with a call to it.",
  params: [
    param.file(),
    param.number("startLine", "First line of code to extract (1-based)"),
    param.number("endLine", "Last line of code to extract (1-based)"),
    param.identifier("name", "Name for the extracted function"),
  ],
  resolve: (project, params) => resolve.sourceFile(project, params as { file: string }),
  preconditions(ctx: SourceFileContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const sf = ctx.sourceFile;
    const startLine = params["startLine"] as number;
    const endLine = params["endLine"] as number;
    const name = params["name"] as string;

    if (endLine < startLine) {
      errors.push("param 'endLine' must be >= 'startLine'");
    }

    const totalLines = sf.getEndLineNumber();
    if (startLine > totalLines) {
      errors.push(`startLine ${startLine} exceeds file length ${totalLines}`);
    }
    if (endLine > totalLines) {
      errors.push(`endLine ${endLine} exceeds file length ${totalLines}`);
    }

    const existing = sf
      .getDescendantsOfKind(SyntaxKind.FunctionDeclaration)
      .find((f) => f.getName() === name);
    if (existing) {
      errors.push(`A function named '${name}' already exists in the file`);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: SourceFileContext, params: Record<string, unknown>): RefactoringResult {
    const sf = ctx.sourceFile;
    const file = params["file"] as string;
    const startLine = params["startLine"] as number;
    const endLine = params["endLine"] as number;
    const name = params["name"] as string;

    // Collect statements whose lines fall within [startLine, endLine]
    const statements = sf.getStatements();
    const toExtract = statements.filter((s) => {
      const start = s.getStartLineNumber();
      const end = s.getEndLineNumber();
      return start >= startLine && end <= endLine;
    });

    if (toExtract.length === 0) {
      return {
        success: false,
        filesChanged: [],
        description: `No complete statements found between lines ${startLine} and ${endLine}`,
      };
    }

    const bodyText = toExtract.map((s) => `  ${s.getText()}`).join("\n");
    const functionText = `\nfunction ${name}(): void {\n${bodyText}\n}\n`;

    // Remove extracted statements (in reverse order to preserve positions)
    const sorted = [...toExtract].sort((a, b) => b.getStart() - a.getStart());
    for (const stmt of sorted) {
      stmt.remove();
    }

    // Insert call to the new function at the position of the first removed statement
    const firstToExtract = toExtract[0];
    const firstIndex = firstToExtract ? statements.indexOf(firstToExtract) : -1;
    const insertIndex = firstIndex >= 0 ? firstIndex : 0;
    sf.insertStatements(insertIndex, `${name}();`);

    // Append function declaration at end of file
    sf.addStatements(functionText);

    return {
      success: true,
      filesChanged: [file],
      description: `Extracted lines ${startLine}-${endLine} into function '${name}'`,
    };
  },
});
