import { SyntaxKind } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { defineRefactoring, param, resolve } from "../../core/refactoring-builder.js";
import type { FunctionContext } from "../../core/refactoring.types.js";

export const parameterizeFunction = defineRefactoring<FunctionContext>({
  name: "Parameterize Function",
  kebabName: "parameterize-function",
  tier: 2,
  description: "Adds a new parameter to a function and updates all call sites within the file.",
  params: [
    param.file(),
    param.identifier("target", "Name of the function to add a parameter to"),
    param.identifier("paramName", "Name of the new parameter"),
    param.string("paramType", "TypeScript type of the new parameter"),
  ],
  resolve: (project, params) =>
    resolve.function(project, params as { file: string; target: string }),
  preconditions(ctx: FunctionContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const paramName = params["paramName"] as string;

    const existing = ctx.fn.getParameters().find((param) => param.getName() === paramName);
    if (existing) {
      errors.push(`Function '${ctx.fn.getName()}' already has a parameter named '${paramName}'`);
    }

    const hasRestParam = ctx.fn.getParameters().some((p) => p.isRestParameter());
    if (hasRestParam) {
      errors.push(
        `Function '${ctx.fn.getName()}' has a rest parameter. Cannot add a parameter after it.`,
      );
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
