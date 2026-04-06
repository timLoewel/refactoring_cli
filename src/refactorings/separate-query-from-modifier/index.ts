import { SyntaxKind, Node } from "ts-morph";
import type { Statement } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { defineRefactoring, enumerate, param, resolve } from "../../core/refactoring-builder.js";
import type { FunctionContext } from "../../core/refactoring.types.js";

export const separateQueryFromModifier = defineRefactoring<FunctionContext>({
  name: "Separate Query From Modifier",
  kebabName: "separate-query-from-modifier",
  tier: 2,
  description:
    "Splits a function that both returns a value and has side effects into a pure query function and a void modifier function.",
  params: [
    param.file(),
    param.identifier("target", "Name of the function to split into query and modifier"),
  ],
  resolve: (project, params) =>
    resolve.function(project, params as { file: string; target: string }),
  preconditions(ctx: FunctionContext): PreconditionResult {
    const errors: string[] = [];
    const { fn, body } = ctx;

    // Skip generic functions: type parameters aren't copied to the generated query/modifier
    // functions, causing "Cannot find name 'T'" errors in the generated code.
    if (fn.getTypeParameters().length > 0) {
      errors.push(
        `Function '${fn.getName()}' has generic type parameters; cannot safely split into query and modifier`,
      );
      return { ok: false, errors };
    }

    // Must return something (query part) and have side effects (modifier part)
    const returnStmts = body.getDescendantsOfKind(SyntaxKind.ReturnStatement);
    if (returnStmts.length === 0) {
      errors.push(`Function '${fn.getName()}' has no return statement; cannot separate query`);
    }

    const returnTypeNode = fn.getReturnTypeNode();
    const returnType = returnTypeNode ? returnTypeNode.getText() : null;
    if (returnType === "void") {
      errors.push(`Function '${fn.getName()}' returns void; it is already a pure modifier`);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: FunctionContext, params: Record<string, unknown>): RefactoringResult {
    const sf = ctx.sourceFile;
    const file = params["file"] as string;
    const target = params["target"] as string;
    const { fn, body } = ctx;

    if (!Node.isBlock(body)) {
      return {
        success: false,
        filesChanged: [],
        description: `Function '${target}' body is not a block`,
      };
    }
    const statements = body.getStatements();
    const returnTypeNode = fn.getReturnTypeNode();
    const returnType = returnTypeNode ? returnTypeNode.getText() : "unknown";

    const fnParams = fn.getParameters();
    const paramList = fnParams
      .map((param) => {
        const typeNode = param.getTypeNode();
        return `${param.getName()}${param.hasQuestionToken() ? "?" : ""}: ${typeNode ? typeNode.getText() : "unknown"}`;
      })
      .join(", ");
    const paramNames = fnParams.map((p2) => p2.getName()).join(", ");

    // Separate return statement from side-effect statements
    const returnStmts = statements.filter(
      (s: Statement) => s.getKind() === SyntaxKind.ReturnStatement,
    );
    const sideEffectStmts = statements.filter(
      (s: Statement) => s.getKind() !== SyntaxKind.ReturnStatement,
    );

    const queryName = `get${target.charAt(0).toUpperCase()}${target.slice(1)}`;
    const modifierName = `set${target.charAt(0).toUpperCase()}${target.slice(1)}`;

    // Build query function (returns the value, no side effects)
    const returnStmt = returnStmts[0];
    if (!returnStmt) {
      return {
        success: false,
        filesChanged: [],
        description: `Function '${target}' has no return statement`,
      };
    }
    const returnExpr =
      returnStmt.asKind(SyntaxKind.ReturnStatement)?.getExpression()?.getText() ?? "undefined";

    const queryBody = `  return ${returnExpr};`;
    const queryFn = `function ${queryName}(${paramList}): ${returnType} {\n${queryBody}\n}`;

    // Build modifier function (side effects only, returns void)
    const modifierBody = sideEffectStmts.map((s: Statement) => `  ${s.getText()}`).join("\n");
    const modifierFn = `function ${modifierName}(${paramList}): void {\n${modifierBody}\n}`;

    // Replace the original function body to call both
    const newBody = `{\n  ${modifierName}(${paramNames});\n  return ${queryName}(${paramNames});\n}`;

    body.replaceWithText(newBody);

    // Append the two new functions
    sf.addStatements(`\n${queryFn}\n\n${modifierFn}`);

    return {
      success: true,
      filesChanged: [file],
      description: `Split '${target}' into query '${queryName}' and modifier '${modifierName}'`,
    };
  },
  enumerate: enumerate.functions,
});
