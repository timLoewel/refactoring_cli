import { SyntaxKind, Node } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { defineRefactoring, enumerate, param, resolve } from "../../core/refactoring-builder.js";
import type { FunctionContext } from "../../core/refactoring.types.js";

export const replaceExceptionWithPrecheck = defineRefactoring<FunctionContext>({
  name: "Replace Exception With Precheck",
  kebabName: "replace-exception-with-precheck",
  tier: 2,
  description:
    "Adds a precondition guard at the start of a function so that callers avoid the exceptional path.",
  params: [
    param.file(),
    param.identifier("target", "Name of the function to add a precheck to"),
    param.string("condition", "Boolean expression to check before execution (e.g. 'value > 0')"),
  ],
  resolve: (project, params) =>
    resolve.function(project, params as { file: string; target: string }),
  preconditions(ctx: FunctionContext): PreconditionResult {
    const errors: string[] = [];
    const throwStatements = ctx.body.getDescendantsOfKind(SyntaxKind.ThrowStatement);
    if (throwStatements.length === 0) {
      errors.push(`Function '${ctx.fn.getName()}' contains no throw statements to replace`);
    }

    // A single precheck can only guard one conditional throw. If the function has
    // multiple throw statements in separate conditional branches, a single boolean
    // precondition cannot simultaneously guard all of them.
    if (throwStatements.length > 1) {
      const distinctParentIfs = new Set(
        throwStatements.map((t) => {
          const ifAncestor = t.getFirstAncestorByKind(SyntaxKind.IfStatement);
          return ifAncestor ? ifAncestor.getStart() : -1;
        }),
      );
      if (distinctParentIfs.size > 1) {
        errors.push(
          `Function '${ctx.fn.getName()}' has ${throwStatements.length} throw statements in separate conditional branches; a single precheck cannot guard all of them`,
        );
      }
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: FunctionContext, params: Record<string, unknown>): RefactoringResult {
    const file = params["file"] as string;
    const target = params["target"] as string;
    const condition = params["condition"] as string;
    const { fn, body } = ctx;

    // Find throw statements
    const throwStatements = body.getDescendantsOfKind(SyntaxKind.ThrowStatement);
    if (throwStatements.length === 0) {
      return {
        success: false,
        filesChanged: [],
        description: `No throw statements found in '${target}'`,
      };
    }

    // Prepend a guard precheck at the start of the function body.
    // If the function returns non-void, throw instead of returning undefined.
    const returnTypeNode = fn.getReturnTypeNode();
    const returnType = returnTypeNode ? returnTypeNode.getText() : null;
    const guardAction =
      returnType && returnType !== "void"
        ? `throw new Error("Precondition failed: ${condition}")`
        : "return";
    const precheckStatement = `if (!(${condition})) { ${guardAction}; }`;

    fn.addStatements(precheckStatement);

    // Move the precheck to the beginning of the body
    if (Node.isBlock(body)) {
      const statements = body.getStatements();
      const lastStatement = statements[statements.length - 1];
      if (lastStatement) {
        const precheckText = lastStatement.getText();
        lastStatement.remove();
        body.insertStatements(0, precheckText);
      }
    }

    return {
      success: true,
      filesChanged: [file],
      description: `Added precheck '${condition}' to function '${target}' to avoid exception path`,
    };
  },
  enumerate: enumerate.functions,
});
