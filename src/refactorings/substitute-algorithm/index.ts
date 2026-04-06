import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { defineRefactoring, enumerate, param, resolve } from "../../core/refactoring-builder.js";
import type { FunctionContext } from "../../core/refactoring.types.js";

export const substituteAlgorithm = defineRefactoring<FunctionContext>({
  name: "Substitute Algorithm",
  kebabName: "substitute-algorithm",
  tier: 2,
  description: "Replaces the entire body of a function with a new implementation.",
  params: [
    param.file(),
    param.identifier("target", "Name of the function whose body should be replaced"),
    param.string("newBody", "New function body as a block string (e.g. '{ return x * 2; }')"),
  ],
  resolve: (project, params) =>
    resolve.function(project, params as { file: string; target: string }),
  preconditions(ctx: FunctionContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const newBody = params["newBody"] as string;

    const trimmed = newBody.trim();
    if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
      errors.push("param 'newBody' must be a block statement wrapped in curly braces");
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: FunctionContext, params: Record<string, unknown>): RefactoringResult {
    const file = params["file"] as string;
    const target = params["target"] as string;
    const newBody = params["newBody"] as string;
    const { body } = ctx;

    const trimmed = newBody.trim();
    if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
      return {
        success: false,
        filesChanged: [],
        description: "newBody must be a block statement wrapped in curly braces",
      };
    }

    // Replace the body with the new body text
    body.replaceWithText(trimmed);

    return {
      success: true,
      filesChanged: [file],
      description: `Replaced body of function '${target}' with the new algorithm`,
    };
  },
  enumerate: enumerate.functions,
});
