import { Node, SyntaxKind } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../engine/refactoring.types.js";
import { defineRefactoring, param, resolve } from "../../engine/refactoring-builder.js";
import type { SourceFileContext } from "../../engine/refactoring-builder.js";

const LOOP_KINDS = new Set([
  SyntaxKind.WhileStatement,
  SyntaxKind.ForStatement,
  SyntaxKind.ForInStatement,
  SyntaxKind.ForOfStatement,
  SyntaxKind.DoStatement,
]);

function findLoopUsingFlag(sf: Node, flagName: string): Node | undefined {
  const loops = sf.getDescendants().filter((n) => LOOP_KINDS.has(n.getKind()));
  return loops.find((loop) =>
    loop.getDescendantsOfKind(SyntaxKind.Identifier).some((id) => id.getText() === flagName),
  );
}

function replaceFlagAssignmentsWithBreak(loop: Node, flagName: string): void {
  const flagAssignments = loop.getDescendantsOfKind(SyntaxKind.BinaryExpression).filter((bin) => {
    const left = bin.getLeft();
    const op = bin.getOperatorToken().getText();
    return Node.isIdentifier(left) && left.getText() === flagName && op === "=";
  });

  const sorted = [...flagAssignments].sort((a, b) => b.getStart() - a.getStart());
  for (const assignment of sorted) {
    const exprStmt = assignment.getParent();
    if (exprStmt && Node.isExpressionStatement(exprStmt)) {
      exprStmt.replaceWithText("break;");
    }
  }
}

function updateLoopCondition(loop: Node, flagName: string): void {
  if (Node.isWhileStatement(loop)) {
    const condition = loop.getExpression();
    const condText = condition.getText();
    if (condText === flagName || condText === `!${flagName}`) {
      condition.replaceWithText("true");
    }
  }
}

function removeFlagDeclaration(varDecl: Node): void {
  const declList = varDecl.getParent();
  if (declList && Node.isVariableDeclarationList(declList)) {
    const stmt = declList.getParent();
    if (stmt && Node.isVariableStatement(stmt)) {
      stmt.remove();
    }
  }
}

function inlineRemainingFlagChecks(loop: Node, flagName: string): void {
  const remainingRefs = loop
    .getDescendantsOfKind(SyntaxKind.Identifier)
    .filter((id) => id.getText() === flagName);

  const sorted = [...remainingRefs].sort((a, b) => b.getStart() - a.getStart());
  for (const ref of sorted) {
    const parent = ref.getParent();
    if (!parent || !Node.isIfStatement(parent) || parent.getExpression() !== ref) continue;

    const thenStmt = parent.getThenStatement();
    if (Node.isBlock(thenStmt)) {
      parent.replaceWithText(
        thenStmt
          .getStatements()
          .map((s) => s.getText())
          .join("\n"),
      );
    } else {
      parent.replaceWithText(thenStmt.getText());
    }
  }
}

export const replaceControlFlagWithBreak = defineRefactoring<SourceFileContext>({
  name: "Replace Control Flag with Break",
  kebabName: "replace-control-flag-with-break",
  tier: 1,
  description:
    "Replaces a boolean control flag used to exit a loop with an explicit break statement.",
  params: [
    param.file(),
    param.identifier("target", "Name of the boolean control flag variable to replace"),
  ],
  resolve: (project, params) => resolve.sourceFile(project, params as { file: string }),
  preconditions(ctx: SourceFileContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const target = params["target"] as string;

    const varDecl = ctx.sourceFile
      .getDescendantsOfKind(SyntaxKind.VariableDeclaration)
      .find((d) => d.getName() === target);

    if (!varDecl) {
      errors.push(`Variable '${target}' not found in file`);
      return { ok: false, errors };
    }

    const initializer = varDecl.getInitializer();
    if (!initializer) {
      errors.push(`Variable '${target}' has no initializer`);
      return { ok: false, errors };
    }

    const initKind = initializer.getKind();
    if (initKind !== SyntaxKind.TrueKeyword && initKind !== SyntaxKind.FalseKeyword) {
      errors.push(`Variable '${target}' must be initialized with a boolean literal`);
    }

    const loops = ctx.sourceFile.getDescendants().filter((n) => LOOP_KINDS.has(n.getKind()));
    const usedInLoop = loops.some((loop) => {
      return loop.getDescendantsOfKind(SyntaxKind.Identifier).some((id) => id.getText() === target);
    });

    if (!usedInLoop) {
      errors.push(`Variable '${target}' is not used inside any loop`);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: SourceFileContext, params: Record<string, unknown>): RefactoringResult {
    const file = params["file"] as string;
    const target = params["target"] as string;

    const varDecl = ctx.sourceFile
      .getDescendantsOfKind(SyntaxKind.VariableDeclaration)
      .find((d) => d.getName() === target);
    if (!varDecl) {
      return {
        success: false,
        filesChanged: [],
        description: `Variable '${target}' not found`,
      };
    }

    const targetLoop = findLoopUsingFlag(ctx.sourceFile, target);
    if (!targetLoop) {
      return {
        success: false,
        filesChanged: [],
        description: `No loop found that uses '${target}'`,
      };
    }

    replaceFlagAssignmentsWithBreak(targetLoop, target);
    updateLoopCondition(targetLoop, target);
    removeFlagDeclaration(varDecl);
    inlineRemainingFlagChecks(targetLoop, target);

    return {
      success: true,
      filesChanged: [file],
      description: `Replaced control flag '${target}' with break statement`,
    };
  },
});
