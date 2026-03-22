import { SyntaxKind, Node } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../engine/refactoring.types.js";
import { defineRefactoring, param, resolve } from "../../engine/refactoring-builder.js";
import type { SourceFileContext } from "../../engine/refactoring-builder.js";

export const consolidateConditionalExpression = defineRefactoring<SourceFileContext>({
  name: "Consolidate Conditional Expression",
  kebabName: "consolidate-conditional-expression",
  tier: 2,
  description:
    "Combines sequential if statements with the same result into a single if with a combined condition.",
  params: [
    param.file(),
    param.string("target", "Line number of the first if-return statement to consolidate (1-based)"),
  ],
  resolve: (project, params) => resolve.sourceFile(project, params as { file: string }),
  preconditions(ctx: SourceFileContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const sf = ctx.sourceFile;
    const targetStr = params["target"] as string;
    const lineNum = Number(targetStr);
    if (!Number.isInteger(lineNum) || lineNum < 1) {
      errors.push("param 'target' must be a positive integer line number");
      return { ok: false, errors };
    }

    const ifStatements = sf.getDescendantsOfKind(SyntaxKind.IfStatement);
    const firstIf = ifStatements.find((s) => s.getStartLineNumber() === lineNum);

    if (!firstIf) {
      errors.push(`No if statement found at line ${lineNum} in file`);
      return { ok: false, errors };
    }

    // Find the parent block and check for consecutive if-returns
    const parent = firstIf.getParent();
    if (!parent || parent.getKind() !== SyntaxKind.Block) {
      errors.push(`If statement at line ${lineNum} is not inside a block`);
      return { ok: false, errors };
    }

    const siblings = parent.getChildrenOfKind(SyntaxKind.IfStatement);
    const adjacentIfs = siblings.filter((s) => s.getStartLineNumber() >= lineNum);

    if (adjacentIfs.length < 2) {
      errors.push(`Need at least 2 consecutive if statements starting at line ${lineNum}`);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: SourceFileContext, params: Record<string, unknown>): RefactoringResult {
    const sf = ctx.sourceFile;
    const file = params["file"] as string;
    const lineNum = Number(params["target"] as string);

    const ifStatements = sf.getDescendantsOfKind(SyntaxKind.IfStatement);
    const firstIf = ifStatements.find((s) => s.getStartLineNumber() === lineNum);

    if (!firstIf) {
      return {
        success: false,
        filesChanged: [],
        description: `No if statement found at line ${lineNum}`,
      };
    }

    const parent = firstIf.getParent();
    if (!parent || parent.getKind() !== SyntaxKind.Block) {
      return {
        success: false,
        filesChanged: [],
        description: `If statement is not inside a block`,
      };
    }

    // Collect consecutive if-return statements starting at target line
    const allStatements = parent.getChildSyntaxList()?.getChildren() ?? [];
    const startIdx = allStatements.findIndex((s) => s.getStartLineNumber() === lineNum);
    if (startIdx === -1) {
      return {
        success: false,
        filesChanged: [],
        description: `Could not locate if statement in parent block`,
      };
    }

    const consecutiveIfs: string[] = [];
    let idx = startIdx;
    while (idx < allStatements.length) {
      const stmt = allStatements[idx];
      if (!stmt || stmt.getKind() !== SyntaxKind.IfStatement) break;
      const ifStmt = stmt.asKind(SyntaxKind.IfStatement);
      if (!ifStmt) break;
      consecutiveIfs.push(ifStmt.getExpression().getText());
      idx++;
    }

    if (consecutiveIfs.length < 2) {
      return {
        success: false,
        filesChanged: [],
        description: `Need at least 2 consecutive if statements`,
      };
    }

    // Get the return value from the first if (assume all return the same or similar value)
    const firstIfNodeRaw = allStatements[startIdx];
    if (!firstIfNodeRaw) {
      return {
        success: false,
        filesChanged: [],
        description: `Could not access first if statement`,
      };
    }
    const firstIfNode = firstIfNodeRaw.asKind(SyntaxKind.IfStatement);
    if (!firstIfNode) {
      return {
        success: false,
        filesChanged: [],
        description: `Could not cast first if statement`,
      };
    }
    const thenBlock = firstIfNode.getThenStatement();
    const returnStmt = thenBlock.getDescendantsOfKind(SyntaxKind.ReturnStatement)[0];
    const returnExpr = returnStmt
      ? (returnStmt.getExpression()?.getText() ?? "undefined")
      : "undefined";

    // Build combined condition
    const combinedCondition = consecutiveIfs.map((c) => `(${c})`).join(" || ");
    const consolidated = `if (${combinedCondition}) return ${returnExpr};`;

    // Remove the consecutive if statements and replace with consolidated one
    const toRemove = allStatements.slice(startIdx, startIdx + consecutiveIfs.length);
    const sortedRemove = [...toRemove].sort((a, b) => b.getStart() - a.getStart());
    for (let i = 1; i < sortedRemove.length; i++) {
      const nodeToRemove = sortedRemove[i];
      if (nodeToRemove && Node.isStatement(nodeToRemove)) {
        nodeToRemove.remove();
      }
    }
    // Replace the first one
    const firstNode = allStatements[startIdx];
    if (!firstNode) {
      return {
        success: false,
        filesChanged: [],
        description: `Could not access first node to replace`,
      };
    }
    firstNode.replaceWithText(consolidated);

    return {
      success: true,
      filesChanged: [file],
      description: `Consolidated ${consecutiveIfs.length} if-return statements at line ${lineNum} into one`,
    };
  },
});
