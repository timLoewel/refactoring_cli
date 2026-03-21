import { Node } from "ts-morph";
import type { Project, Statement } from "ts-morph";
import type {
  RefactoringDefinition,
  ParamSchema,
  PreconditionResult,
  RefactoringResult,
} from "../../engine/refactoring.types.js";

export interface SlideStatementsParams {
  file: string;
  target: number;
  destination: number;
}

const params: ParamSchema = {
  definitions: [
    {
      name: "file",
      type: "string",
      description: "Path to the TypeScript file",
      required: true,
    },
    {
      name: "target",
      type: "number",
      description: "1-based line number of the statement to move",
      required: true,
    },
    {
      name: "destination",
      type: "number",
      description: "1-based line number to move the statement to",
      required: true,
    },
  ],
  validate(raw: unknown): SlideStatementsParams {
    const r = raw as Record<string, unknown>;
    if (typeof r["file"] !== "string" || r["file"].trim() === "") {
      throw new Error("param 'file' must be a non-empty string");
    }
    if (
      typeof r["target"] !== "number" ||
      !Number.isInteger(r["target"]) ||
      (r["target"] as number) < 1
    ) {
      throw new Error("param 'target' must be a positive integer");
    }
    if (
      typeof r["destination"] !== "number" ||
      !Number.isInteger(r["destination"]) ||
      (r["destination"] as number) < 1
    ) {
      throw new Error("param 'destination' must be a positive integer");
    }
    return {
      file: r["file"] as string,
      target: r["target"] as number,
      destination: r["destination"] as number,
    };
  },
};

function findStatementAtLine(statements: Statement[], line: number): Statement | undefined {
  return statements.find((s) => {
    const sf = s.getSourceFile();
    const lineAndCol = sf.getLineAndColumnAtPos(s.getStart());
    return lineAndCol.line === line;
  });
}

function preconditions(project: Project, p: SlideStatementsParams): PreconditionResult {
  const errors: string[] = [];

  const sf = project.getSourceFile(p.file);
  if (!sf) {
    errors.push(`File not found in project: ${p.file}`);
    return { ok: false, errors };
  }

  if (p.target === p.destination) {
    errors.push("target and destination line numbers must differ");
    return { ok: false, errors };
  }

  const allStatements = sf.getStatements();

  const targetStmt = findStatementAtLine(allStatements, p.target);
  if (!targetStmt) {
    errors.push(`No statement found starting at line ${p.target} in file: ${p.file}`);
    return { ok: false, errors };
  }

  const destStmt = findStatementAtLine(allStatements, p.destination);
  if (!destStmt) {
    errors.push(`No statement found starting at line ${p.destination} in file: ${p.file}`);
  }

  return { ok: errors.length === 0, errors };
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

function apply(project: Project, p: SlideStatementsParams): RefactoringResult {
  const sf = project.getSourceFile(p.file);
  if (!sf) {
    return { success: false, filesChanged: [], description: `File not found: ${p.file}`, diff: [] };
  }

  const allStatements = sf.getStatements();
  const targetStmt = findStatementAtLine(allStatements, p.target);
  if (!targetStmt) {
    return {
      success: false,
      filesChanged: [],
      description: `No statement found at line ${p.target}`,
      diff: [],
    };
  }

  const destStmt = findStatementAtLine(allStatements, p.destination);
  if (!destStmt) {
    return {
      success: false,
      filesChanged: [],
      description: `No statement found at line ${p.destination}`,
      diff: [],
    };
  }

  const targetParent = targetStmt.getParent();
  const destParent = destStmt.getParent();
  if (!targetParent || !destParent || targetParent !== destParent) {
    return {
      success: false,
      filesChanged: [],
      description: "Both statements must be in the same block",
      diff: [],
    };
  }

  if (!Node.isSourceFile(targetParent) && !Node.isBlock(targetParent)) {
    return {
      success: false,
      filesChanged: [],
      description: "Statements are not inside a block or source file",
      diff: [],
    };
  }

  const result = moveStatementInBlock(targetParent, targetStmt, destStmt);
  if (!result.success) {
    return {
      success: false,
      filesChanged: [],
      description: result.reason ?? "Move failed",
      diff: [],
    };
  }

  return {
    success: true,
    filesChanged: [p.file],
    description: `Moved statement from line ${p.target} to line ${p.destination}`,
    diff: [],
  };
}

export const slideStatements: RefactoringDefinition = {
  name: "Slide Statements",
  kebabName: "slide-statements",
  description:
    "Moves a statement to a different position within the same block, allowing reordering without changing behavior.",
  tier: 1,
  params,
  preconditions: (project: Project, raw: unknown): PreconditionResult =>
    preconditions(project, params.validate(raw) as SlideStatementsParams),
  apply: (project: Project, raw: unknown): RefactoringResult =>
    apply(project, params.validate(raw) as SlideStatementsParams),
};
