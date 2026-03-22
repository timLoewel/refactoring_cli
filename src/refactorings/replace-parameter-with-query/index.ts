import { SyntaxKind, Node } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../engine/refactoring.types.js";
import {
  defineRefactoring,
  fileParam,
  identifierParam,
  resolveFunction,
} from "../../engine/refactoring-builder.js";
import type { FunctionContext } from "../../engine/refactoring-builder.js";

export const replaceParameterWithQuery = defineRefactoring<FunctionContext>({
  name: "Replace Parameter With Query",
  kebabName: "replace-parameter-with-query",
  tier: 2,
  description:
    "Removes a parameter that can be derived inside the function and replaces it with an internal computation.",
  params: [
    fileParam(),
    identifierParam("target", "Name of the function to modify"),
    identifierParam("param", "Name of the parameter to remove and replace with an internal query"),
  ],
  resolve: (project, params) =>
    resolveFunction(project, params as { file: string; target: string }),
  preconditions(ctx: FunctionContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const paramName = params["param"] as string;

    const paramNode = ctx.fn.getParameter(paramName);
    if (!paramNode) {
      errors.push(`Parameter '${paramName}' not found in function '${ctx.fn.getName()}'`);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: FunctionContext, params: Record<string, unknown>): RefactoringResult {
    const sf = ctx.sourceFile;
    const file = params["file"] as string;
    const target = params["target"] as string;
    const paramName = params["param"] as string;
    const { fn, body } = ctx;

    const paramNode = fn.getParameter(paramName);
    if (!paramNode) {
      return {
        success: false,
        filesChanged: [],
        description: `Parameter '${paramName}' not found in '${target}'`,
      };
    }

    const paramTypeNode = paramNode.getTypeNode();
    const paramType = paramTypeNode ? paramTypeNode.getText() : "unknown";

    // Get the index of the parameter to drop from call sites
    const paramIndex = fn.getParameters().findIndex((pr) => pr.getName() === paramName);

    // Insert a local const at the top of the body as a placeholder query
    if (!Node.isBlock(body)) {
      return {
        success: false,
        filesChanged: [],
        description: `Function '${target}' body is not a block`,
      };
    }
    body.insertStatements(
      0,
      `const ${paramName}: ${paramType} = /* TODO: replace with actual query */ ${paramName} as unknown as ${paramType};`,
    );

    // Remove the parameter from the function signature
    paramNode.remove();

    // Update all call sites to drop the corresponding argument
    const callExprs = sf.getDescendantsOfKind(SyntaxKind.CallExpression).filter((c) => {
      return c.getExpression().getText() === target;
    });

    for (const call of callExprs) {
      const args = call.getArguments();
      if (paramIndex < args.length) {
        call.removeArgument(paramIndex);
      }
    }

    return {
      success: true,
      filesChanged: [file],
      description: `Removed parameter '${paramName}' from '${target}' and replaced with internal query placeholder`,
    };
  },
});
