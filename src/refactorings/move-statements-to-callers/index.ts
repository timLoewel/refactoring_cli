import { SyntaxKind, Node } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { defineRefactoring, enumerate, param, resolve } from "../../core/refactoring-builder.js";
import { cleanupUnused } from "../../core/cleanup-unused.js";
import type { FunctionContext } from "../../core/refactoring.types.js";

export const moveStatementsToCallers = defineRefactoring<FunctionContext>({
  name: "Move Statements To Callers",
  kebabName: "move-statements-to-callers",
  tier: 2,
  description: "Moves the last statement of a function body to each of its call sites.",
  params: [
    param.file(),
    param.identifier(
      "target",
      "Name of the function whose last statement should be moved to call sites",
    ),
  ],
  resolve: (project, params) =>
    resolve.function(project, params as { file: string; target: string }),
  preconditions(ctx: FunctionContext): PreconditionResult {
    const errors: string[] = [];
    const stmts = Node.isBlock(ctx.body) ? ctx.body.getStatements() : [];
    if (stmts.length === 0) {
      errors.push(`Function '${ctx.fn.getName()}' body is empty — nothing to move`);
      return { ok: false, errors };
    }

    // Moving a return-with-value statement out of the function would remove the function's
    // return, leaving it without a required return value.
    const lastStmt = stmts[stmts.length - 1];
    if (lastStmt && Node.isReturnStatement(lastStmt) && lastStmt.getExpression() !== undefined) {
      errors.push(
        `Last statement of '${ctx.fn.getName()}' is a return statement with a value; moving it would break the function's return`,
      );
      return { ok: false, errors };
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: FunctionContext, params: Record<string, unknown>): RefactoringResult {
    const sf = ctx.sourceFile;
    const file = params["file"] as string;
    const target = params["target"] as string;
    const { body } = ctx;

    const stmts = Node.isBlock(body) ? body.getStatements() : [];
    if (stmts.length === 0) {
      return {
        success: false,
        filesChanged: [],
        description: `Function '${target}' body is empty`,
      };
    }

    const lastStmt = stmts[stmts.length - 1];
    if (!lastStmt) {
      return {
        success: false,
        filesChanged: [],
        description: `Function '${target}' body is empty`,
      };
    }
    const lastStmtText = lastStmt.getText();

    // Find all call expression statements for this function
    const calls = sf.getDescendantsOfKind(SyntaxKind.CallExpression).filter((c) => {
      return c.getExpression().getText() === target;
    });

    const callStatements = calls
      .map((c) => {
        const parent = c.getParent();
        if (parent && SyntaxKind[parent.getKind()] === "ExpressionStatement") {
          return parent;
        }
        return null;
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);

    // Insert the last statement after each call site (reverse order)
    const sorted = [...callStatements].sort((a, b) => b.getStart() - a.getStart());
    for (const callStmt of sorted) {
      callStmt.replaceWithText(`${callStmt.getText()}\n${lastStmtText}`);
    }

    // Remove the last statement from the function
    lastStmt.remove();

    cleanupUnused(sf);

    return {
      success: true,
      filesChanged: [file],
      description: `Moved last statement of '${target}' to ${sorted.length} call site(s)`,
    };
  },
  enumerate: enumerate.functions,
});
