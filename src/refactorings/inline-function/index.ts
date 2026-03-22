import { SyntaxKind, Node } from "ts-morph";
import type { Statement } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { defineRefactoring, param, resolve } from "../../core/refactoring-builder.js";
import type { FunctionContext } from "../../core/refactoring.types.js";

export const inlineFunction = defineRefactoring<FunctionContext>({
  name: "Inline Function",
  kebabName: "inline-function",
  tier: 2,
  description:
    "Replaces all call sites of a function with the function's body and removes the declaration.",
  params: [param.file(), param.identifier("target", "Name of the function to inline")],
  resolve: (project, params) =>
    resolve.function(project, params as { file: string; target: string }),
  preconditions(): PreconditionResult {
    return { ok: true, errors: [] };
  },
  apply(ctx: FunctionContext, params: Record<string, unknown>): RefactoringResult {
    const sf = ctx.sourceFile;
    const file = params["file"] as string;
    const target = params["target"] as string;
    const { fn, body } = ctx;

    // Get body statements as text (strip outer braces)
    const bodyStatements: Statement[] = Node.isBlock(body) ? body.getStatements() : [];
    const bodyText = bodyStatements.map((s: Statement) => s.getText()).join("\n");

    // Replace call expressions matching the target function
    const calls = sf.getDescendantsOfKind(SyntaxKind.CallExpression).filter((c) => {
      const expr = c.getExpression();
      return expr.getText() === target;
    });

    // Replace each call site's expression statement with the inlined body
    const callStatements = calls
      .map((c) => {
        const parent = c.getParent();
        if (parent && SyntaxKind[parent.getKind()] === "ExpressionStatement") {
          return parent;
        }
        return null;
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);

    const sorted = [...callStatements].sort((a, b) => b.getStart() - a.getStart());
    for (const stmt of sorted) {
      stmt.replaceWithText(bodyText);
    }

    // Remove the function declaration
    fn.remove();

    return {
      success: true,
      filesChanged: [file],
      description: `Inlined function '${target}' at ${sorted.length} call site(s)`,
    };
  },
});
