import { SyntaxKind } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { defineRefactoring, enumerate, param, resolve } from "../../core/refactoring-builder.js";
import type { FunctionContext } from "../../core/refactoring.types.js";

export const replaceErrorCodeWithException = defineRefactoring<FunctionContext>({
  name: "Replace Error Code With Exception",
  kebabName: "replace-error-code-with-exception",
  tier: 2,
  description:
    "Replaces negative numeric return values (error codes) with thrown exceptions in a function.",
  params: [
    param.file(),
    param.identifier(
      "target",
      "Name of the function whose error code returns should be replaced with exceptions",
    ),
  ],
  resolve: (project, params) =>
    resolve.function(project, params as { file: string; target: string }),
  preconditions(ctx: FunctionContext): PreconditionResult {
    const errors: string[] = [];
    const { fn, body } = ctx;

    // Check that the function returns a negative numeric literal (error code pattern)
    const returnStatements = body.getDescendantsOfKind(SyntaxKind.ReturnStatement);
    const hasNegativeReturn = returnStatements.some((ret) => {
      const expr = ret.getExpression();
      if (!expr) return false;
      const text = expr.getText().trim();
      return /^-\d+$/.test(text);
    });

    if (!hasNegativeReturn) {
      errors.push(
        `Function '${fn.getName()}' does not contain negative numeric return statements (error codes)`,
      );
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: FunctionContext, params: Record<string, unknown>): RefactoringResult {
    const file = params["file"] as string;
    const target = params["target"] as string;
    const { fn, body } = ctx;

    const returnStatements = body.getDescendantsOfKind(SyntaxKind.ReturnStatement);
    const sorted = [...returnStatements].sort((a, b) => b.getStart() - a.getStart());

    let replaced = 0;
    for (const ret of sorted) {
      const expr = ret.getExpression();
      if (!expr) continue;
      const text = expr.getText().trim();
      if (/^-\d+$/.test(text)) {
        ret.replaceWithText(`throw new Error("Error code: ${text}")`);
        replaced++;
      }
    }

    if (replaced === 0) {
      return {
        success: false,
        filesChanged: [],
        description: `No negative return statements found in '${target}'`,
      };
    }

    // Only update return type to void if no remaining return statements return a value
    const remainingReturns = body.getDescendantsOfKind(SyntaxKind.ReturnStatement);
    const hasValueReturn = remainingReturns.some((ret) => ret.getExpression() !== undefined);
    if (!hasValueReturn) {
      const returnTypeNode = fn.getReturnTypeNode();
      if (returnTypeNode && returnTypeNode.getText() === "number") {
        fn.setReturnType("void");
      }
    }

    return {
      success: true,
      filesChanged: [file],
      description: `Replaced ${replaced} error code return(s) with exceptions in function '${target}'`,
    };
  },
  enumerate: enumerate.functions,
});
