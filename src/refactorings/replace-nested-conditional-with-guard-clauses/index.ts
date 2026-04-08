import { SyntaxKind, Node } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { defineRefactoring, enumerate, param, resolve } from "../../core/refactoring-builder.js";
import type { FunctionContext } from "../../core/refactoring.types.js";
import { cleanupUnused } from "../../core/cleanup-unused.js";

function nodeText(node: Node): string {
  if (node.getKind() !== SyntaxKind.Block) return node.getText();
  const children = node.getChildSyntaxList()?.getChildren();
  return children ? children.map((s: Node) => s.getText()).join("\n") : node.getText();
}

function processStatements(statements: Node[]): string[] {
  const outputLines: string[] = [];

  for (const stmt of statements) {
    const ifStmt = stmt.asKind(SyntaxKind.IfStatement);
    const elseClause = ifStmt?.getElseStatement();

    if (!ifStmt || !elseClause) {
      outputLines.push(stmt.getText());
      continue;
    }

    const condition = ifStmt.getExpression().getText();
    const thenBlock = ifStmt.getThenStatement();

    const thenHasReturn =
      thenBlock.getKind() === SyntaxKind.ReturnStatement ||
      thenBlock.getDescendantsOfKind(SyntaxKind.ReturnStatement).length > 0;
    if (thenHasReturn) {
      outputLines.push(`if (${condition}) {\n  ${nodeText(thenBlock)}\n}`);
      outputLines.push(nodeText(elseClause));
    } else {
      const firstElseReturn = elseClause.getDescendantsOfKind(SyntaxKind.ReturnStatement)[0];
      const earlyReturnExpr = firstElseReturn?.getExpression()?.getText() ?? "undefined";
      outputLines.push(`if (!(${condition})) return ${earlyReturnExpr};`);
      outputLines.push(nodeText(thenBlock));
    }
  }

  return outputLines;
}

export const replaceNestedConditionalWithGuardClauses = defineRefactoring<FunctionContext>({
  name: "Replace Nested Conditional With Guard Clauses",
  kebabName: "replace-nested-conditional-with-guard-clauses",
  tier: 2,
  description:
    "Flattens deeply nested if-else conditionals in a function into early-return guard clauses.",
  params: [
    param.file(),
    param.identifier("target", "Name of the function to flatten nested conditionals in"),
  ],
  resolve: (project, params) =>
    resolve.function(project, params as { file: string; target: string }),
  preconditions(ctx: FunctionContext): PreconditionResult {
    const errors: string[] = [];
    const ifStatements = ctx.body.getDescendantsOfKind(SyntaxKind.IfStatement);
    if (ifStatements.length === 0) {
      errors.push(
        `Function '${ctx.fn.getName()}' has no if statements to convert to guard clauses`,
      );
    }
    return { ok: errors.length === 0, errors };
  },
  apply(ctx: FunctionContext, params: Record<string, unknown>): RefactoringResult {
    const file = params["file"] as string;
    const target = params["target"] as string;
    const { body } = ctx;

    if (!Node.isBlock(body)) {
      return {
        success: false,
        filesChanged: [],
        description: `Function '${target}' has no block body`,
      };
    }

    const outputLines = processStatements(body.getStatements());

    const newBodyText = outputLines.map((s) => `  ${s}`).join("\n");
    body.replaceWithText(`{\n${newBodyText}\n}`);

    cleanupUnused(ctx.sourceFile);

    return {
      success: true,
      filesChanged: [file],
      description: `Replaced nested conditionals in '${target}' with guard clauses`,
    };
  },
  enumerate: enumerate.functions,
});
