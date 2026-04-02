import { SyntaxKind, Node } from "ts-morph";
import type { Statement } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { defineRefactoring, param, resolve } from "../../core/refactoring-builder.js";
import type { FunctionContext } from "../../core/refactoring.types.js";

export const splitPhase = defineRefactoring<FunctionContext>({
  name: "Split Phase",
  kebabName: "split-phase",
  tier: 2,
  description:
    "Splits a function into two sequential phase functions and updates the original to delegate to them.",
  params: [
    param.file(),
    param.identifier("target", "Name of the function to split into two phases"),
    param.identifier("firstPhaseName", "Name for the first phase function"),
    param.identifier("secondPhaseName", "Name for the second phase function"),
  ],
  resolve: (project, params) =>
    resolve.function(project, params as { file: string; target: string }),
  preconditions(ctx: FunctionContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const sf = ctx.sourceFile;
    const { body } = ctx;
    const firstPhaseName = params["firstPhaseName"] as string;
    const secondPhaseName = params["secondPhaseName"] as string;

    if (firstPhaseName === secondPhaseName) {
      errors.push(
        `'firstPhaseName' and 'secondPhaseName' must be different (both are '${firstPhaseName}')`,
      );
      return { ok: false, errors };
    }

    // Skip functions that already return a value — splitting would leave the wrapper without
    // a return statement, violating the declared return type.
    const returnTypeNode = ctx.fn.getReturnTypeNode();
    const returnTypeText = returnTypeNode?.getText() ?? "";
    if (returnTypeText && returnTypeText !== "void" && returnTypeText !== "undefined") {
      const hasValueReturn =
        Node.isBlock(body) &&
        body
          .getDescendantsOfKind(SyntaxKind.ReturnStatement)
          .some((r) => r.getExpression() !== undefined);
      if (hasValueReturn) {
        errors.push(
          `Function '${ctx.fn.getName()}' returns a value; split-phase would lose the return. Only void/mutating functions are supported.`,
        );
        return { ok: false, errors };
      }
    }

    const bodyStmtCount = Node.isBlock(body) ? body.getStatements().length : 0;
    if (bodyStmtCount < 2) {
      errors.push(
        `Function '${ctx.fn.getName()}' must have at least 2 statements to split into two phases`,
      );
    }

    for (const phaseName of [firstPhaseName, secondPhaseName]) {
      const conflict = sf
        .getDescendantsOfKind(SyntaxKind.FunctionDeclaration)
        .find((f) => f.getName() === phaseName);
      if (conflict) {
        errors.push(`A function named '${phaseName}' already exists in the file`);
      }
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: FunctionContext, params: Record<string, unknown>): RefactoringResult {
    const sf = ctx.sourceFile;
    const file = params["file"] as string;
    const target = params["target"] as string;
    const firstPhaseName = params["firstPhaseName"] as string;
    const secondPhaseName = params["secondPhaseName"] as string;
    const { fn, body } = ctx;

    if (!Node.isBlock(body)) {
      return {
        success: false,
        filesChanged: [],
        description: `Function '${target}' body is not a block`,
      };
    }
    const stmts = body.getStatements();
    if (stmts.length < 2) {
      return {
        success: false,
        filesChanged: [],
        description: `Function '${target}' needs at least 2 statements`,
      };
    }

    const paramText = fn
      .getParameters()
      .map((par) => par.getText())
      .join(", ");
    const midpoint = Math.floor(stmts.length / 2);

    const firstStatements = stmts
      .slice(0, midpoint)
      .map((s: Statement) => `  ${s.getText()}`)
      .join("\n");
    const secondStatements = stmts
      .slice(midpoint)
      .map((s: Statement) => `  ${s.getText()}`)
      .join("\n");

    const firstFunc = `\nfunction ${firstPhaseName}(${paramText}): void {\n${firstStatements}\n}\n`;
    const secondFunc = `\nfunction ${secondPhaseName}(${paramText}): void {\n${secondStatements}\n}\n`;

    // Replace the body of the original function with calls to both phases
    const argNames = fn
      .getParameters()
      .map((par) => par.getName())
      .join(", ");
    body.replaceWithText(
      `{\n  ${firstPhaseName}(${argNames});\n  ${secondPhaseName}(${argNames});\n}`,
    );

    sf.addStatements(firstFunc);
    sf.addStatements(secondFunc);

    return {
      success: true,
      filesChanged: [file],
      description: `Split function '${target}' into '${firstPhaseName}' and '${secondPhaseName}'`,
    };
  },
});
