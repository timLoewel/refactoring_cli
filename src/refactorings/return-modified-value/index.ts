import {
  Node,
  SyntaxKind,
  VariableDeclarationKind,
  type ParameterDeclaration,
  type SourceFile,
} from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { defineRefactoring, enumerate, param, resolve } from "../../core/refactoring-builder.js";
import type { FunctionContext } from "../../core/refactoring.types.js";

function addReturnStatement(ctx: FunctionContext, firstParam: ParameterDeclaration): void {
  const paramName = firstParam.getName();
  ctx.body.addStatements(`return ${paramName};`);

  const existingReturnType = ctx.fn.getReturnTypeNode();
  const existingReturnText = existingReturnType?.getText() ?? "";
  const isVoidReturn =
    !existingReturnType || existingReturnText === "void" || existingReturnText === "Promise<void>";
  if (isVoidReturn) {
    const paramTypeNode = firstParam.getTypeNode();
    const baseType = paramTypeNode ? paramTypeNode.getText() : "unknown";
    const isAsync = ctx.fn.isAsync();
    ctx.fn.setReturnType(isAsync ? `Promise<${baseType}>` : baseType);
  }
}

function promoteConstToLet(sourceFile: SourceFile, identifierName: string): void {
  const declarations = sourceFile
    .getDescendantsOfKind(SyntaxKind.VariableDeclaration)
    .filter((d) => d.getName() === identifierName);

  for (const decl of declarations) {
    const declList = decl.getVariableStatement();
    if (declList && declList.getDeclarationKind() === VariableDeclarationKind.Const) {
      declList.setDeclarationKind(VariableDeclarationKind.Let);
    }
  }
}

function updateCallSites(sourceFile: SourceFile, target: string): void {
  const callExprs = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression).filter((call) => {
    const expr = call.getExpression();
    return Node.isIdentifier(expr) && expr.getText() === target;
  });

  for (const call of callExprs) {
    const callParent = call.getParent();
    if (!callParent || !Node.isExpressionStatement(callParent)) continue;

    const callArgs = call.getArguments();
    const firstArg = callArgs[0];
    if (!firstArg) continue;

    const argText = firstArg.getText();

    if (Node.isIdentifier(firstArg)) {
      promoteConstToLet(sourceFile, argText);
    }

    callParent.replaceWithText(
      `${argText} = ${target}(${callArgs.map((a) => a.getText()).join(", ")});`,
    );
  }
}

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
      return { ok: false, errors };
    }

    // Skip rest parameters: `return values` when the param is `...values` returns an array,
    // which typically doesn't match the declared return type.
    const firstParam = paramList[0];
    if (firstParam?.isRestParameter()) {
      errors.push(
        `Function '${ctx.fn.getName()}' first parameter is a rest parameter; cannot safely return it`,
      );
      return { ok: false, errors };
    }

    // Skip functions that already return a value — this refactoring is for void/mutating
    // functions only. Adding another return at the end would either be unreachable or cause
    // a type mismatch.
    const existingReturns = ctx.body
      .getDescendantsOfKind(SyntaxKind.ReturnStatement)
      .filter((r) => r.getExpression() !== undefined);
    if (existingReturns.length > 0) {
      errors.push(
        `Function '${ctx.fn.getName()}' already returns a value; this refactoring is for void/mutating functions`,
      );
      return { ok: false, errors };
    }

    // Skip type predicate return types (e.g. `v is SomeType`): `return v` won't satisfy it.
    const returnTypeNode = ctx.fn.getReturnTypeNode();
    if (returnTypeNode && Node.isTypePredicate(returnTypeNode)) {
      errors.push(
        `Function '${ctx.fn.getName()}' has a type predicate return type; cannot add a plain parameter return`,
      );
      return { ok: false, errors };
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: FunctionContext, params: Record<string, unknown>): RefactoringResult {
    const file = params["file"] as string;
    const target = params["target"] as string;

    const firstParam = ctx.fn.getParameters()[0];
    if (!firstParam) {
      return {
        success: false,
        filesChanged: [],
        description: `Could not access first parameter of '${target}'`,
      };
    }

    addReturnStatement(ctx, firstParam);
    updateCallSites(ctx.sourceFile, target);

    return {
      success: true,
      filesChanged: [file],
      description: `Changed '${target}' to return its mutated parameter '${firstParam.getName()}' and updated call sites`,
    };
  },
  enumerate: enumerate.functions,
});
