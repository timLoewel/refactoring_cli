import { SyntaxKind, Node } from "ts-morph";
import type { Project } from "ts-morph";
import type {
  RefactoringDefinition,
  ParamSchema,
  PreconditionResult,
  RefactoringResult,
} from "../../engine/refactoring.types.js";

interface ConsolidateConditionalExpressionParams {
  file: string;
  target: string;
}

const params: ParamSchema = {
  definitions: [
    { name: "file", type: "string", description: "Path to the TypeScript file", required: true },
    {
      name: "target",
      type: "string",
      description: "Line number of the first if-return statement to consolidate (1-based)",
      required: true,
    },
  ],
  validate(raw: unknown): ConsolidateConditionalExpressionParams {
    const r = raw as Record<string, unknown>;
    if (typeof r["file"] !== "string" || r["file"].trim() === "") {
      throw new Error("param 'file' must be a non-empty string");
    }
    if (typeof r["target"] !== "string" || r["target"].trim() === "") {
      throw new Error("param 'target' must be a non-empty string");
    }
    const lineNum = Number(r["target"]);
    if (!Number.isInteger(lineNum) || lineNum < 1) {
      throw new Error("param 'target' must be a positive integer line number");
    }
    return { file: r["file"] as string, target: r["target"] as string };
  },
};

function preconditions(
  project: Project,
  p: ConsolidateConditionalExpressionParams,
): PreconditionResult {
  const errors: string[] = [];

  const sf = project.getSourceFile(p.file);
  if (!sf) {
    errors.push(`File not found in project: ${p.file}`);
    return { ok: false, errors };
  }

  const lineNum = Number(p.target);
  const ifStatements = sf.getDescendantsOfKind(SyntaxKind.IfStatement);
  const firstIf = ifStatements.find((s) => s.getStartLineNumber() === lineNum);

  if (!firstIf) {
    errors.push(`No if statement found at line ${lineNum} in file: ${p.file}`);
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
}

function apply(project: Project, p: ConsolidateConditionalExpressionParams): RefactoringResult {
  const sf = project.getSourceFile(p.file);
  if (!sf) {
    return { success: false, filesChanged: [], description: `File not found: ${p.file}`, diff: [] };
  }

  const lineNum = Number(p.target);
  const ifStatements = sf.getDescendantsOfKind(SyntaxKind.IfStatement);
  const firstIf = ifStatements.find((s) => s.getStartLineNumber() === lineNum);

  if (!firstIf) {
    return {
      success: false,
      filesChanged: [],
      description: `No if statement found at line ${lineNum}`,
      diff: [],
    };
  }

  const parent = firstIf.getParent();
  if (!parent || parent.getKind() !== SyntaxKind.Block) {
    return {
      success: false,
      filesChanged: [],
      description: `If statement is not inside a block`,
      diff: [],
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
      diff: [],
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
      diff: [],
    };
  }

  // Get the return value from the first if (assume all return the same or similar value)
  const firstIfNodeRaw = allStatements[startIdx];
  if (!firstIfNodeRaw) {
    return {
      success: false,
      filesChanged: [],
      description: `Could not access first if statement`,
      diff: [],
    };
  }
  const firstIfNode = firstIfNodeRaw.asKind(SyntaxKind.IfStatement);
  if (!firstIfNode) {
    return {
      success: false,
      filesChanged: [],
      description: `Could not cast first if statement`,
      diff: [],
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
      diff: [],
    };
  }
  firstNode.replaceWithText(consolidated);

  return {
    success: true,
    filesChanged: [p.file],
    description: `Consolidated ${consecutiveIfs.length} if-return statements at line ${lineNum} into one`,
    diff: [],
  };
}

export const consolidateConditionalExpression: RefactoringDefinition = {
  name: "Consolidate Conditional Expression",
  kebabName: "consolidate-conditional-expression",
  description:
    "Combines sequential if statements with the same result into a single if with a combined condition.",
  tier: 2,
  params,
  preconditions: (project: Project, raw: unknown): PreconditionResult =>
    preconditions(project, params.validate(raw) as ConsolidateConditionalExpressionParams),
  apply: (project: Project, raw: unknown): RefactoringResult =>
    apply(project, params.validate(raw) as ConsolidateConditionalExpressionParams),
};
