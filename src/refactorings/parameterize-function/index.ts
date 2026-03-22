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

export const parameterizeFunction = defineRefactoring<FunctionContext>({
  name: "Parameterize Function",
  kebabName: "parameterize-function",
  tier: 2,
  description: "Adds a new parameter to a function and updates all call sites within the file.",
  params: [
    fileParam(),
    identifierParam("target", "Name of the function to add a parameter to"),
    identifierParam("paramName", "Name of the new parameter"),
    stringParam("paramType", "TypeScript type of the new parameter"),
  ],
  resolve: (project, params) =>
    resolveFunction(project, params as { file: string; target: string }),
  preconditions(ctx: FunctionContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const paramName = params["paramName"] as string;

    const existing = ctx.fn.getParameters().find((param) => param.getName() === paramName);
    if (existing) {
      errors.push(`Function '${ctx.fn.getName()}' already has a parameter named '${paramName}'`);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: FunctionContext, params: Record<string, unknown>): RefactoringResult {
    const sf = ctx.sourceFile;
    const file = params["file"] as string;
    const target = params["target"] as string;
    const paramName = params["paramName"] as string;
    const paramType = params["paramType"] as string;

    // Add the new parameter at the end of the parameter list
    ctx.fn.addParameter({ name: paramName, type: paramType });

    // Update all call sites to pass undefined for the new parameter
    const calls = sf.getDescendantsOfKind(SyntaxKind.CallExpression).filter((c) => {
      return c.getExpression().getText() === target;
    });

    const sorted = [...calls].sort((a, b) => b.getStart() - a.getStart());
    for (const call of sorted) {
      call.addArgument("undefined");
    }

    return {
      success: true,
      filesChanged: [file],
      description: `Added parameter '${paramName}: ${paramType}' to function '${target}' and updated ${sorted.length} call site(s)`,
    };
  },
});
