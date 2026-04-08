import { SyntaxKind } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { defineRefactoring, enumerate, param, resolve } from "../../core/refactoring-builder.js";
import type { FunctionContext } from "../../core/refactoring.types.js";

export const replaceQueryWithParameter = defineRefactoring<FunctionContext>({
  name: "Replace Query With Parameter",
  kebabName: "replace-query-with-parameter",
  tier: 2,
  description:
    "Replaces a global or module-level expression used inside a function with an explicit parameter, making the dependency visible.",
  params: [
    param.file(),
    param.identifier("target", "Name of the function to modify"),
    param.string("query", "The expression inside the function to replace with a parameter"),
    param.identifier("paramName", "Name for the new parameter"),
  ],
  resolve: (project, params) =>
    resolve.function(project, params as { file: string; target: string }),
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

    // Reject queries containing function calls — moving them to the call site
    // changes evaluation order, which alters observable behaviour for impure
    // expressions (e.g. Math.random()).
    if (query.includes("(")) {
      errors.push(
        `Query '${query}' contains a function call; moving it to the call site would change evaluation order`,
      );
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

    // Infer the type of the query expression from its usage in the body
    let paramType = "unknown";
    const queryNodes = body
      .getDescendantsOfKind(SyntaxKind.Identifier)
      .filter((id) => id.getText() === query);
    if (queryNodes.length > 0) {
      const inferred = queryNodes[0].getType().getText(queryNodes[0]);
      if (inferred && !inferred.includes("import(") && inferred !== "") {
        paramType = inferred;
      }
    }

    // Add new parameter to function signature
    fn.addParameter({ name: paramName, type: paramType });

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
  enumerate: enumerate.functions,
});
