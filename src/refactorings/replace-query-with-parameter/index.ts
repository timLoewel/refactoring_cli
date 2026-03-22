import { SyntaxKind } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../engine/refactoring.types.js";
import {
  defineRefactoring,
  fileParam,
  identifierParam,
  stringParam,
  resolveFunction,
} from "../../engine/refactoring-builder.js";
import type { FunctionContext } from "../../engine/refactoring-builder.js";

export const replaceQueryWithParameter = defineRefactoring<FunctionContext>({
  name: "Replace Query With Parameter",
  kebabName: "replace-query-with-parameter",
  tier: 2,
  description:
    "Replaces a global or module-level expression used inside a function with an explicit parameter, making the dependency visible.",
  params: [
    fileParam(),
    identifierParam("target", "Name of the function to modify"),
    stringParam("query", "The expression inside the function to replace with a parameter"),
    identifierParam("paramName", "Name for the new parameter"),
  ],
  resolve: (project, params) =>
    resolveFunction(project, params as { file: string; target: string }),
  preconditions(ctx: FunctionContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const query = params["query"] as string;
    const paramName = params["paramName"] as string;

    const bodyText = ctx.body.getText();
    if (!bodyText.includes(query)) {
      errors.push(`Expression '${query}' not found in body of '${ctx.fn.getName()}'`);
    }

    const existing = ctx.fn.getParameter(paramName);
    if (existing) {
      errors.push(`Parameter '${paramName}' already exists in function '${ctx.fn.getName()}'`);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: FunctionContext, params: Record<string, unknown>): RefactoringResult {
    const sf = ctx.sourceFile;
    const file = params["file"] as string;
    const target = params["target"] as string;
    const query = params["query"] as string;
    const paramName = params["paramName"] as string;
    const { fn, body } = ctx;

    // Add new parameter to function signature
    fn.addParameter({ name: paramName, type: "unknown" });

    // Replace occurrences of the query expression in the body with the new param name
    const bodyText = body.getText();
    const updatedBody = bodyText.split(query).join(paramName);
    body.replaceWithText(updatedBody);

    // Update all call sites to pass the query expression as the new argument
    const callExprs = sf.getDescendantsOfKind(SyntaxKind.CallExpression).filter((c) => {
      return c.getExpression().getText() === target;
    });

    for (const call of callExprs) {
      call.addArgument(query);
    }

    return {
      success: true,
      filesChanged: [file],
      description: `Replaced query '${query}' in '${target}' with new parameter '${paramName}'`,
    };
  },
});
