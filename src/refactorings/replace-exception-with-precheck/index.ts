import { SyntaxKind, Node } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../engine/refactoring.types.js";
import {
  defineRefactoring,
  fileParam,
  identifierParam,
  stringParam,
  resolveFunction,
} from "../../engine/refactoring-builder.js";
import type { FunctionContext } from "../../engine/refactoring-builder.js";

export const replaceExceptionWithPrecheck = defineRefactoring<FunctionContext>({
  name: "Replace Exception With Precheck",
  kebabName: "replace-exception-with-precheck",
  tier: 2,
  description:
    "Adds a precondition guard at the start of a function so that callers avoid the exceptional path.",
  params: [
    fileParam(),
    identifierParam("target", "Name of the function to add a precheck to"),
    stringParam("condition", "Boolean expression to check before execution (e.g. 'value > 0')"),
  ],
  resolve: (project, params) =>
    resolveFunction(project, params as { file: string; target: string }),
  preconditions(ctx: FunctionContext): PreconditionResult {
    const errors: string[] = [];
    const throwStatements = ctx.body.getDescendantsOfKind(SyntaxKind.ThrowStatement);
    if (throwStatements.length === 0) {
      errors.push(`Function '${ctx.fn.getName()}' contains no throw statements to replace`);
    }
    return { ok: errors.length === 0, errors };
  },
  apply(ctx: FunctionContext, params: Record<string, unknown>): RefactoringResult {
    const file = params["file"] as string;
    const target = params["target"] as string;
    const condition = params["condition"] as string;
    const { fn, body } = ctx;

    // Find throw statements
    const throwStatements = body.getDescendantsOfKind(SyntaxKind.ThrowStatement);
    if (throwStatements.length === 0) {
      return {
        success: false,
        filesChanged: [],
        description: `No throw statements found in '${target}'`,
      };
    }

    // Prepend a guard precheck at the start of the function body
    const precheckStatement = `if (!(${condition})) { return; }`;

    fn.addStatements(precheckStatement);

    // Move the precheck to the beginning of the body
    if (Node.isBlock(body)) {
      const statements = body.getStatements();
      const lastStatement = statements[statements.length - 1];
      if (lastStatement) {
        const precheckText = lastStatement.getText();
        lastStatement.remove();
        body.insertStatements(0, precheckText);
      }
    }

    return {
      success: true,
      filesChanged: [file],
      description: `Added precheck '${condition}' to function '${target}' to avoid exception path`,
    };
  },
});
