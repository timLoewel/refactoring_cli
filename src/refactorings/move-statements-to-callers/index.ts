import { SyntaxKind, Node } from "ts-morph";
import type { Project } from "ts-morph";
import type {
  RefactoringDefinition,
  ParamSchema,
  PreconditionResult,
  RefactoringResult,
} from "../../engine/refactoring.types.js";

interface MoveStatementsToCallersParams {
  file: string;
  target: string;
}

const params: ParamSchema = {
  definitions: [
    { name: "file", type: "string", description: "Path to the TypeScript file", required: true },
    {
      name: "target",
      type: "string",
      description: "Name of the function whose last statement should be moved to call sites",
      required: true,
    },
  ],
  validate(raw: unknown): MoveStatementsToCallersParams {
    const r = raw as Record<string, unknown>;
    if (typeof r["file"] !== "string" || r["file"].trim() === "") {
      throw new Error("param 'file' must be a non-empty string");
    }
    if (typeof r["target"] !== "string" || r["target"].trim() === "") {
      throw new Error("param 'target' must be a non-empty string");
    }
    return { file: r["file"] as string, target: r["target"] as string };
  },
};

function preconditions(project: Project, p: MoveStatementsToCallersParams): PreconditionResult {
  const errors: string[] = [];

  const sf = project.getSourceFile(p.file);
  if (!sf) {
    errors.push(`File not found in project: ${p.file}`);
    return { ok: false, errors };
  }

  const fn = sf
    .getDescendantsOfKind(SyntaxKind.FunctionDeclaration)
    .find((f) => f.getName() === p.target);
  if (!fn) {
    errors.push(`Function '${p.target}' not found in file: ${p.file}`);
    return { ok: false, errors };
  }

  const body = fn.getBody();
  if (!body) {
    errors.push(`Function '${p.target}' has no body`);
    return { ok: false, errors };
  }

  const stmts = Node.isBlock(body) ? body.getStatements() : [];
  if (stmts.length === 0) {
    errors.push(`Function '${p.target}' body is empty — nothing to move`);
  }

  return { ok: errors.length === 0, errors };
}

function apply(project: Project, p: MoveStatementsToCallersParams): RefactoringResult {
  const sf = project.getSourceFile(p.file);
  if (!sf) {
    return { success: false, filesChanged: [], description: `File not found: ${p.file}` };
  }

  const fn = sf
    .getDescendantsOfKind(SyntaxKind.FunctionDeclaration)
    .find((f) => f.getName() === p.target);
  if (!fn) {
    return {
      success: false,
      filesChanged: [],
      description: `Function '${p.target}' not found`,
    };
  }

  const body = fn.getBody();
  if (!body) {
    return {
      success: false,
      filesChanged: [],
      description: `Function '${p.target}' has no body`,
    };
  }

  const stmts = Node.isBlock(body) ? body.getStatements() : [];
  if (stmts.length === 0) {
    return {
      success: false,
      filesChanged: [],
      description: `Function '${p.target}' body is empty`,
    };
  }

  const lastStmt = stmts[stmts.length - 1];
  if (!lastStmt) {
    return {
      success: false,
      filesChanged: [],
      description: `Function '${p.target}' body is empty`,
    };
  }
  const lastStmtText = lastStmt.getText();

  // Find all call expression statements for this function
  const calls = sf.getDescendantsOfKind(SyntaxKind.CallExpression).filter((c) => {
    return c.getExpression().getText() === p.target;
  });

  const callStatements = calls
    .map((c) => {
      const parent = c.getParent();
      if (parent && SyntaxKind[parent.getKind()] === "ExpressionStatement") {
        return parent;
      }
      return null;
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);

  // Insert the last statement after each call site (reverse order)
  const sorted = [...callStatements].sort((a, b) => b.getStart() - a.getStart());
  for (const callStmt of sorted) {
    callStmt.replaceWithText(`${callStmt.getText()}\n${lastStmtText}`);
  }

  // Remove the last statement from the function
  lastStmt.remove();

  return {
    success: true,
    filesChanged: [p.file],
    description: `Moved last statement of '${p.target}' to ${sorted.length} call site(s)`,
  };
}

export const moveStatementsToCallers: RefactoringDefinition = {
  name: "Move Statements To Callers",
  kebabName: "move-statements-to-callers",
  description: "Moves the last statement of a function body to each of its call sites.",
  tier: 2,
  params,
  preconditions: (project: Project, raw: unknown): PreconditionResult =>
    preconditions(project, params.validate(raw) as MoveStatementsToCallersParams),
  apply: (project: Project, raw: unknown): RefactoringResult =>
    apply(project, params.validate(raw) as MoveStatementsToCallersParams),
};
