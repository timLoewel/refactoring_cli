import { Node, SyntaxKind } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { defineRefactoring, param, resolve } from "../../core/refactoring-builder.js";
import type { FunctionContext } from "../../core/refactoring.types.js";

export const returnModifiedValue = defineRefactoring<FunctionContext>({
  name: "Return Modified Value",
  kebabName: "return-modified-value",
  tier: 1,
  description:
    "Changes a function that mutates a parameter to instead return the modified value, and updates call sites to capture the return.",
  params: [
    param.file(),
    param.identifier(
      "target",
      "Name of the function that mutates a parameter to be changed to return it",
    ),
  ],
  resolve: (project, params) =>
    resolve.function(project, params as { file: string; target: string }),
  preconditions(ctx: FunctionContext, _params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const paramList = ctx.fn.getParameters();
    if (paramList.length === 0) {
      errors.push(`Function '${ctx.fn.getName()}' has no parameters to return`);
    }
    return { ok: errors.length === 0, errors };
  },
  apply(ctx: FunctionContext, params: Record<string, unknown>): RefactoringResult {
    const file = params["file"] as string;
    const target = params["target"] as string;

    const parameters = ctx.fn.getParameters();
    const firstParam = parameters[0];
    if (!firstParam) {
      return {
        success: false,
        filesChanged: [],
        description: `Could not access first parameter of '${target}'`,
      };
    }

    const paramName = firstParam.getName();

    // Add return statement at end of function body
    ctx.body.addStatements(`return ${paramName};`);

    // Update the function's return type annotation if it was void or absent
    const existingReturnType = ctx.fn.getReturnTypeNode();
    if (!existingReturnType || existingReturnType.getText() === "void") {
      const paramTypeNode = firstParam.getTypeNode();
      const returnTypeText = paramTypeNode ? paramTypeNode.getText() : "unknown";
      ctx.fn.setReturnType(returnTypeText);
    }

    // Update call sites: wrap existing call expression with assignment
    const callExprs = ctx.sourceFile
      .getDescendantsOfKind(SyntaxKind.CallExpression)
      .filter((call) => {
        const expr = call.getExpression();
        return Node.isIdentifier(expr) && expr.getText() === target;
      });

    for (const call of callExprs) {
      const callParent = call.getParent();
      if (!callParent || !Node.isExpressionStatement(callParent)) {
        continue;
      }

      const callArgs = call.getArguments();
      const firstArg = callArgs[0];
      if (!firstArg) {
        continue;
      }

      const argText = firstArg.getText();
      callParent.replaceWithText(
        `${argText} = ${target}(${callArgs.map((a) => a.getText()).join(", ")});`,
      );
    }

    return {
      success: true,
      filesChanged: [file],
      description: `Changed '${target}' to return its mutated parameter '${paramName}' and updated call sites`,
    };
  },
});
