import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { defineRefactoring, param, resolve } from "../../core/refactoring-builder.js";
import type { FunctionContext } from "../../core/refactoring.types.js";

function buildAssertionStatement(condition: string, message: string | undefined): string {
  const errorMsg =
    message !== undefined && message.trim() !== ""
      ? JSON.stringify(message)
      : JSON.stringify(`Assertion failed: ${condition}`);
  return `if (!(${condition})) { throw new Error(${errorMsg}); }`;
}

export const introduceAssertion = defineRefactoring<FunctionContext>({
  name: "Introduce Assertion",
  kebabName: "introduce-assertion",
  tier: 1,
  description:
    "Inserts an assertion guard at the beginning of a function to make its preconditions explicit.",
  params: [
    param.file(),
    param.identifier("target", "Name of the function to add the assertion to"),
    param.string("condition", "The boolean condition expression that must be true (e.g. 'n >= 0')"),
    param.string("message", "Optional error message thrown when the assertion fails", false),
  ],
  resolve: (project, params) =>
    resolve.function(project, params as { file: string; target: string }),
  preconditions(_ctx: FunctionContext, _params: Record<string, unknown>): PreconditionResult {
    // resolve.function already validates file exists, function exists, and has a block body
    return { ok: true, errors: [] };
  },
  apply(ctx: FunctionContext, params: Record<string, unknown>): RefactoringResult {
    const file = params["file"] as string;
    const condition = params["condition"] as string;
    const message = params["message"] as string | undefined;

    const assertionStatement = buildAssertionStatement(condition, message);
    ctx.body.insertStatements(0, assertionStatement);

    return {
      success: true,
      filesChanged: [file],
      description: `Inserted assertion '${condition}' at the start of function '${ctx.fn.getName()}'`,
    };
  },
});
