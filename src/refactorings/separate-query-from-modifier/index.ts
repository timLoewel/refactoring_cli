import { SyntaxKind, Node } from "ts-morph";
import type { Project, Statement } from "ts-morph";
import type {
  EnumerateCandidate,
  FunctionContext,
  PreconditionResult,
  RefactoringResult,
} from "../../core/refactoring.types.js";
import { defineRefactoring, param, resolve } from "../../core/refactoring-builder.js";
import { findReferencedTypeParams } from "../../core/type-params.js";

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

    // Must return something (query part) and have side effects (modifier part)
    const returnStmts = body.getDescendantsOfKind(SyntaxKind.ReturnStatement);
    if (returnStmts.length === 0) {
      errors.push(`Function '${fn.getName()}' has no return statement; cannot separate query`);
      return { ok: false, errors };
    }

    const returnTypeNode = fn.getReturnTypeNode();
    const returnType = returnTypeNode ? returnTypeNode.getText() : null;
    if (returnType === "void") {
      errors.push(`Function '${fn.getName()}' returns void; it is already a pure modifier`);
      return { ok: false, errors };
    }

    // Check if the return expression references local variables declared in non-return statements.
    // If so, the query can't be separated because it depends on modifier state.
    if (Node.isBlock(body)) {
      const statements = body.getStatements();
      const sideEffectStmts = statements.filter((s) => s.getKind() !== SyntaxKind.ReturnStatement);
      const localNames = new Set<string>();
      for (const stmt of sideEffectStmts) {
        for (const d of stmt.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
          localNames.add(d.getName());
        }
      }

      if (localNames.size > 0) {
        const returnStmt = returnStmts[0];
        const returnExpr = returnStmt?.asKind(SyntaxKind.ReturnStatement)?.getExpression();
        if (returnExpr) {
          for (const id of returnExpr.getDescendantsOfKind(SyntaxKind.Identifier)) {
            if (localNames.has(id.getText())) {
              errors.push(
                `Return expression references local variable '${id.getText()}' declared in side-effect statements; cannot separate query from modifier`,
              );
              return { ok: false, errors };
            }
          }
          // Also check the return expression itself if it's an identifier
          if (
            returnExpr.getKind() === SyntaxKind.Identifier &&
            localNames.has(returnExpr.getText())
          ) {
            errors.push(
              `Return expression references local variable '${returnExpr.getText()}' declared in side-effect statements; cannot separate query from modifier`,
            );
            return { ok: false, errors };
          }
        }
      }
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
    let returnType: string;
    if (returnTypeNode) {
      returnType = returnTypeNode.getText();
    } else {
      // Infer return type from the function's type checker
      const inferredType = fn.getReturnType().getText(fn);
      returnType =
        inferredType.includes("import(") || inferredType === "" ? "unknown" : inferredType;
    }

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

    // Detect if the function is async (need to propagate to generated functions)
    const isAsync = fn.isAsync();
    const awaitPrefix = isAsync ? "await " : "";

    // Check if modifier body uses await
    const modifierHasAwait = sideEffectStmts.some(
      (s) => s.getDescendantsOfKind(SyntaxKind.AwaitExpression).length > 0,
    );
    const modifierAsync = modifierHasAwait ? "async " : "";
    const modifierAwait = modifierHasAwait ? "await " : "";

    // Check if return expression uses await
    const queryHasAwait = returnStmt.getDescendantsOfKind(SyntaxKind.AwaitExpression).length > 0;
    const queryAsync = queryHasAwait ? "async " : "";

    // Propagate type parameters from enclosing generic context
    const typeParamsArr = findReferencedTypeParams(body);
    const typeParams = typeParamsArr.length > 0 ? typeParamsArr[0] : "";

    const queryBody = `  return ${returnExpr};`;
    const queryFn = `${queryAsync}function ${queryName}${typeParams}(${paramList}): ${returnType} {\n${queryBody}\n}`;

    // Build modifier function (side effects only, returns void)
    const modifierBody = sideEffectStmts.map((s: Statement) => `  ${s.getText()}`).join("\n");
    const modifierVoidType = modifierHasAwait ? "Promise<void>" : "void";
    const modifierFn = `${modifierAsync}function ${modifierName}${typeParams}(${paramList}): ${modifierVoidType} {\n${modifierBody}\n}`;

    // Replace the original function body to call both
    const newBody = `{\n  ${modifierAwait}${modifierName}(${paramNames});\n  return ${awaitPrefix}${queryName}(${paramNames});\n}`;

    body.replaceWithText(newBody);

    // Append the two new functions
    sf.addStatements(`\n${queryFn}\n\n${modifierFn}`);

    return {
      success: true,
      filesChanged: [file],
      description: `Split '${target}' into query '${queryName}' and modifier '${modifierName}'`,
    };
  },
  enumerate(project: Project): EnumerateCandidate[] {
    const candidates: EnumerateCandidate[] = [];
    for (const sf of project.getSourceFiles()) {
      const file = sf.getFilePath();
      for (const fn of sf.getDescendantsOfKind(SyntaxKind.FunctionDeclaration)) {
        const name = fn.getName();
        if (!name) continue;
        const body = fn.getBody();
        if (!body || !Node.isBlock(body)) continue;
        const stmts = body.getStatements();
        // Must have both return statements AND side-effect statements
        const hasReturn = stmts.some((s) => s.getKind() === SyntaxKind.ReturnStatement);
        const hasSideEffects = stmts.some((s) => s.getKind() !== SyntaxKind.ReturnStatement);
        if (!hasReturn || !hasSideEffects) continue;
        // Skip void return type
        const retType = fn.getReturnTypeNode();
        if (retType && retType.getText() === "void") continue;
        candidates.push({ file, target: name });
      }
    }
    return candidates;
  },
});
