import { SyntaxKind, Node } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../engine/refactoring.types.js";
import { defineRefactoring, param, resolve } from "../../engine/refactoring-builder.js";
import type { FunctionContext } from "../../engine/refactoring-builder.js";

function extractBlockText(node: Node): string {
  if (node.getKind() === SyntaxKind.Block) {
    const children = node.getChildSyntaxList()?.getChildren();
    if (children) {
      return children.map((s: Node) => s.getText()).join("\n");
    }
  }
  return node.getText();
}

interface GuardClauseResult {
  guardClauses: string[];
  mainBody: string;
  otherStatements: string[];
}

function processStatements(statements: Node[]): GuardClauseResult {
  const guardClauses: string[] = [];
  const otherStatements: string[] = [];
  let mainBody = "";

  for (const stmt of statements) {
    const ifStmt = stmt.asKind(SyntaxKind.IfStatement);
    if (!ifStmt) {
      otherStatements.push(stmt.getText());
      continue;
    }

    const elseClause = ifStmt.getElseStatement();
    if (!elseClause) {
      otherStatements.push(stmt.getText());
      continue;
    }

    const condition = ifStmt.getExpression().getText();
    const thenBlock = ifStmt.getThenStatement();
    const thenReturns = thenBlock.getDescendantsOfKind(SyntaxKind.ReturnStatement);

    if (thenReturns.length > 0) {
      guardClauses.push(`if (${condition}) {\n  ${extractBlockText(thenBlock)}\n}`);
      mainBody = extractBlockText(elseClause);
    } else {
      const elseReturns = elseClause.getDescendantsOfKind(SyntaxKind.ReturnStatement);
      const firstElseReturn = elseReturns[0];
      const earlyReturnExpr = firstElseReturn
        ? (firstElseReturn.getExpression()?.getText() ?? "undefined")
        : "undefined";
      guardClauses.push(`if (!(${condition})) return ${earlyReturnExpr};`);
      mainBody = extractBlockText(thenBlock);
    }
  }

  return { guardClauses, mainBody, otherStatements };
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

    const { guardClauses, mainBody, otherStatements } = processStatements(body.getStatements());

    const allLines = [...otherStatements.filter((s) => !s.includes("if (")), ...guardClauses];
    if (mainBody) allLines.push(mainBody);

    const newBodyText = allLines.map((s) => `  ${s}`).join("\n");
    body.replaceWithText(`{\n${newBodyText}\n}`);

    return {
      success: true,
      filesChanged: [file],
      description: `Replaced nested conditionals in '${target}' with guard clauses`,
    };
  },
});
