import { Node } from "ts-morph";
import type { Statement } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../engine/refactoring.types.js";
import {
  defineRefactoring,
  fileParam,
  numberParam,
  resolveSourceFile,
} from "../../engine/refactoring-builder.js";
import type { SourceFileContext } from "../../engine/refactoring-builder.js";

function findStatementAtLine(statements: Statement[], line: number): Statement | undefined {
  return statements.find((s) => {
    const sf = s.getSourceFile();
    const lineAndCol = sf.getLineAndColumnAtPos(s.getStart());
    return lineAndCol.line === line;
  });
}

interface MoveResult {
  success: boolean;
  reason?: string;
}

function moveStatementInBlock(
  parent: {
    getStatements: () => Statement[];
    insertStatements: (index: number, text: string) => void;
  },
  targetStmt: Statement,
  destStmt: Statement,
): MoveResult {
  const stmts = parent.getStatements();
  const targetIndex = stmts.indexOf(targetStmt);
  const destIndex = stmts.indexOf(destStmt);
  if (targetIndex === -1 || destIndex === -1) {
    return { success: false, reason: "Could not determine statement indices" };
  }

  const statementText = targetStmt.getText();
  const insertIndex = destIndex > targetIndex ? destIndex + 1 : destIndex;
  parent.insertStatements(insertIndex, statementText);

  const updatedStmts = parent.getStatements();
  const originalIndex = destIndex > targetIndex ? targetIndex : targetIndex + 1;
  const stmtToRemove = updatedStmts[originalIndex];
  if (stmtToRemove) {
    stmtToRemove.remove();
  }
  return { success: true };
}

export const slideStatements = defineRefactoring<SourceFileContext>({
  name: "Slide Statements",
  kebabName: "slide-statements",
  tier: 1,
  description:
    "Moves a statement to a different position within the same block, allowing reordering without changing behavior.",
  params: [
    fileParam(),
    numberParam("target", "1-based line number of the statement to move"),
    numberParam("destination", "1-based line number to move the statement to"),
  ],
  resolve: (project, params) =>
    resolveSourceFile(project, params as { file: string }),
  preconditions(ctx: SourceFileContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const sf = ctx.sourceFile;
    const target = params["target"] as number;
    const destination = params["destination"] as number;

    if (target === destination) {
      errors.push("target and destination line numbers must differ");
      return { ok: false, errors };
    }

    const allStatements = sf.getStatements();

    const targetStmt = findStatementAtLine(allStatements, target);
    if (!targetStmt) {
      errors.push(`No statement found starting at line ${target} in file: ${params["file"] as string}`);
      return { ok: false, errors };
    }

    const destStmt = findStatementAtLine(allStatements, destination);
    if (!destStmt) {
      errors.push(`No statement found starting at line ${destination} in file: ${params["file"] as string}`);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: SourceFileContext, params: Record<string, unknown>): RefactoringResult {
    const sf = ctx.sourceFile;
    const file = params["file"] as string;
    const target = params["target"] as number;
    const destination = params["destination"] as number;

    const allStatements = sf.getStatements();
    const targetStmt = findStatementAtLine(allStatements, target);
    if (!targetStmt) {
      return {
        success: false,
        filesChanged: [],
        description: `No statement found at line ${target}`,
      };
    }

    const destStmt = findStatementAtLine(allStatements, destination);
    if (!destStmt) {
      return {
        success: false,
        filesChanged: [],
        description: `No statement found at line ${destination}`,
      };
    }

    const targetParent = targetStmt.getParent();
    const destParent = destStmt.getParent();
    if (!targetParent || !destParent || targetParent !== destParent) {
      return {
        success: false,
        filesChanged: [],
        description: "Both statements must be in the same block",
      };
    }

    if (!Node.isSourceFile(targetParent) && !Node.isBlock(targetParent)) {
      return {
        success: false,
        filesChanged: [],
        description: "Statements are not inside a block or source file",
      };
    }

    const result = moveStatementInBlock(targetParent, targetStmt, destStmt);
    if (!result.success) {
      return {
        success: false,
        filesChanged: [],
        description: result.reason ?? "Move failed",
      };
    }

    return {
      success: true,
      filesChanged: [file],
      description: `Moved statement from line ${target} to line ${destination}`,
    };
  },
});
