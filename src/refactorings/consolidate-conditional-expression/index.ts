import { SyntaxKind, Node } from "ts-morph";
import type { IfStatement, Project, SourceFile } from "ts-morph";
import type {
  EnumerateCandidate,
  PreconditionResult,
  RefactoringResult,
  SourceFileContext,
} from "../../core/refactoring.types.js";
import { defineRefactoring, param, resolve } from "../../core/refactoring-builder.js";
import { cleanupUnused } from "../../core/cleanup-unused.js";

function findTargetIf(sf: SourceFile, lineNum: number): IfStatement | undefined {
  return sf
    .getDescendantsOfKind(SyntaxKind.IfStatement)
    .find((s) => s.getStartLineNumber() === lineNum);
}

function collectConsecutiveConditions(allStatements: Node[], startIdx: number): string[] {
  const conditions: string[] = [];
  // All consecutive ifs must return the same expression to be safely consolidated.
  let expectedReturn: string | undefined;
  let idx = startIdx;
  while (idx < allStatements.length) {
    const stmt = allStatements[idx];
    if (!stmt || stmt.getKind() !== SyntaxKind.IfStatement) break;
    const ifStmt = stmt.asKind(SyntaxKind.IfStatement);
    if (!ifStmt) break;
    const returnExpr = extractReturnExpression(stmt);
    if (expectedReturn === undefined) {
      expectedReturn = returnExpr;
    } else if (returnExpr !== expectedReturn) {
      break; // Different return expression — stop collecting
    }
    conditions.push(ifStmt.getExpression().getText());
    idx++;
  }
  return conditions;
}

function extractReturnExpression(node: Node): string {
  const ifStmt = node.asKind(SyntaxKind.IfStatement);
  if (!ifStmt) return "undefined";
  const thenStmt = ifStmt.getThenStatement();
  // The then may be a direct return (no block), or a block containing a return
  if (thenStmt.getKind() === SyntaxKind.ReturnStatement) {
    const retStmt = thenStmt.asKindOrThrow(SyntaxKind.ReturnStatement);
    return retStmt.getExpression()?.getText() ?? "undefined";
  }
  const returnStmt = thenStmt.getDescendantsOfKind(SyntaxKind.ReturnStatement)[0];
  return returnStmt ? (returnStmt.getExpression()?.getText() ?? "undefined") : "undefined";
}

function replaceWithConsolidated(
  allStatements: Node[],
  startIdx: number,
  conditions: string[],
  returnExpr: string,
): boolean {
  const consolidated = `if (${conditions.map((c) => `(${c})`).join(" || ")}) return ${returnExpr};`;

  // 1. Remove the extra ifs first (reverse order to keep positions stable)
  const toRemove = allStatements.slice(startIdx + 1, startIdx + conditions.length);
  for (let i = toRemove.length - 1; i >= 0; i--) {
    const nodeToRemove = toRemove[i];
    if (nodeToRemove && Node.isStatement(nodeToRemove)) {
      nodeToRemove.remove();
    }
  }

  // 2. Replace the first if with the consolidated version
  const firstNode = allStatements[startIdx];
  if (!firstNode) return false;
  firstNode.replaceWithText(consolidated);

  return true;
}

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

    const firstIf = findTargetIf(sf, lineNum);
    if (!firstIf) {
      errors.push(`No if statement found at line ${lineNum} in file`);
      return { ok: false, errors };
    }

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

    const firstIf = findTargetIf(sf, lineNum);
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

    const allStatements = parent.getChildSyntaxList()?.getChildren() ?? [];
    const startIdx = allStatements.findIndex((s) => s.getStartLineNumber() === lineNum);
    if (startIdx === -1) {
      return {
        success: false,
        filesChanged: [],
        description: `Could not locate if statement in parent block`,
      };
    }

    const conditions = collectConsecutiveConditions(allStatements, startIdx);
    if (conditions.length < 2) {
      return {
        success: false,
        filesChanged: [],
        description: `Need at least 2 consecutive if statements`,
      };
    }

    const firstIfNode = allStatements[startIdx];
    if (!firstIfNode) {
      return {
        success: false,
        filesChanged: [],
        description: `Could not access first if statement`,
      };
    }

    const returnExpr = extractReturnExpression(firstIfNode);
    const replaced = replaceWithConsolidated(allStatements, startIdx, conditions, returnExpr);
    if (!replaced) {
      return {
        success: false,
        filesChanged: [],
        description: `Could not access first node to replace`,
      };
    }

    cleanupUnused(sf);

    return {
      success: true,
      filesChanged: [file],
      description: `Consolidated ${conditions.length} if-return statements at line ${lineNum} into one`,
    };
  },
  enumerate(project: Project): EnumerateCandidate[] {
    const candidates: EnumerateCandidate[] = [];
    for (const sf of project.getSourceFiles()) {
      const file = sf.getFilePath();
      for (const ifStmt of sf.getDescendantsOfKind(SyntaxKind.IfStatement)) {
        // Pre-filter: only include if statements that have a consecutive sibling if
        const parent = ifStmt.getParent();
        if (!parent || parent.getKind() !== SyntaxKind.Block) continue;
        const siblings = parent.getChildrenOfKind(SyntaxKind.IfStatement);
        const lineNum = ifStmt.getStartLineNumber();
        const adjacentIfs = siblings.filter((s) => s.getStartLineNumber() >= lineNum);
        if (adjacentIfs.length < 2) continue;
        candidates.push({ file, target: String(lineNum) });
      }
    }
    return candidates;
  },
});
