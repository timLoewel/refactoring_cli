import { SyntaxKind, Node } from "ts-morph";
import type { Statement } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../engine/refactoring.types.js";
import {
  defineRefactoring,
  fileParam,
  identifierParam,
  resolveFunction,
} from "../../engine/refactoring-builder.js";
import type { FunctionContext } from "../../engine/refactoring-builder.js";

export const splitPhase = defineRefactoring<FunctionContext>({
  name: "Split Phase",
  kebabName: "split-phase",
  tier: 2,
  description:
    "Splits a function into two sequential phase functions and updates the original to delegate to them.",
  params: [
    fileParam(),
    identifierParam("target", "Name of the function to split into two phases"),
    identifierParam("firstPhaseName", "Name for the first phase function"),
    identifierParam("secondPhaseName", "Name for the second phase function"),
  ],
  resolve: (project, params) =>
    resolveFunction(project, params as { file: string; target: string }),
  preconditions(ctx: FunctionContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const sf = ctx.sourceFile;
    const { body } = ctx;
    const firstPhaseName = params["firstPhaseName"] as string;
    const secondPhaseName = params["secondPhaseName"] as string;

    const bodyStmtCount = Node.isBlock(body) ? body.getStatements().length : 0;
    if (bodyStmtCount < 2) {
      errors.push(`Function '${ctx.fn.getName()}' must have at least 2 statements to split into two phases`);
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
