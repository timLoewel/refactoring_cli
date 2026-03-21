import { SyntaxKind, Node } from "ts-morph";
import type { Project } from "ts-morph";
import type {
  RefactoringDefinition,
  ParamSchema,
  PreconditionResult,
  RefactoringResult,
} from "../../engine/refactoring.types.js";

interface MoveStatementsIntoFunctionParams {
  file: string;
  target: string;
  startLine: number;
  endLine: number;
}

const params: ParamSchema = {
  definitions: [
    { name: "file", type: "string", description: "Path to the TypeScript file", required: true },
    {
      name: "target",
      type: "string",
      description: "Name of the function to move statements into",
      required: true,
    },
    {
      name: "startLine",
      type: "number",
      description: "First line of statements to move (1-based)",
      required: true,
    },
    {
      name: "endLine",
      type: "number",
      description: "Last line of statements to move (1-based)",
      required: true,
    },
  ],
  validate(raw: unknown): MoveStatementsIntoFunctionParams {
    const r = raw as Record<string, unknown>;
    if (typeof r["file"] !== "string" || r["file"].trim() === "") {
      throw new Error("param 'file' must be a non-empty string");
    }
    if (typeof r["target"] !== "string" || r["target"].trim() === "") {
      throw new Error("param 'target' must be a non-empty string");
    }
    const startLine = Number(r["startLine"]);
    if (!Number.isInteger(startLine) || startLine < 1) {
      throw new Error("param 'startLine' must be a positive integer");
    }
    const endLine = Number(r["endLine"]);
    if (!Number.isInteger(endLine) || endLine < 1) {
      throw new Error("param 'endLine' must be a positive integer");
    }
    if (endLine < startLine) {
      throw new Error("param 'endLine' must be >= 'startLine'");
    }
    return {
      file: r["file"] as string,
      target: r["target"] as string,
      startLine,
      endLine,
    };
  },
};

function preconditions(project: Project, p: MoveStatementsIntoFunctionParams): PreconditionResult {
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

  const totalLines = sf.getEndLineNumber();
  if (p.startLine > totalLines) {
    errors.push(`startLine ${p.startLine} exceeds file length ${totalLines}`);
  }
  if (p.endLine > totalLines) {
    errors.push(`endLine ${p.endLine} exceeds file length ${totalLines}`);
  }

  return { ok: errors.length === 0, errors };
}

function apply(project: Project, p: MoveStatementsIntoFunctionParams): RefactoringResult {
  const sf = project.getSourceFile(p.file);
  if (!sf) {
    return { success: false, filesChanged: [], description: `File not found: ${p.file}`, diff: [] };
  }

  const fn = sf
    .getDescendantsOfKind(SyntaxKind.FunctionDeclaration)
    .find((f) => f.getName() === p.target);
  if (!fn) {
    return {
      success: false,
      filesChanged: [],
      description: `Function '${p.target}' not found`,
      diff: [],
    };
  }

  const body = fn.getBodyOrThrow();

  // Find top-level statements in the line range
  const statements = sf.getStatements();
  const toMove = statements.filter((s) => {
    const start = s.getStartLineNumber();
    const end = s.getEndLineNumber();
    return start >= p.startLine && end <= p.endLine;
  });

  if (toMove.length === 0) {
    return {
      success: false,
      filesChanged: [],
      description: `No complete statements found between lines ${p.startLine} and ${p.endLine}`,
      diff: [],
    };
  }

  const movedText = toMove.map((s) => `  ${s.getText()}`).join("\n");

  // Append statements to the function body
  if (!Node.isBlock(body)) {
    return {
      success: false,
      filesChanged: [],
      description: `Function '${p.target}' body is not a block`,
      diff: [],
    };
  }
  body.addStatements(movedText);

  // Remove the statements from the top level (reverse order)
  const sorted = [...toMove].sort((a, b) => b.getStart() - a.getStart());
  for (const stmt of sorted) {
    stmt.remove();
  }

  return {
    success: true,
    filesChanged: [p.file],
    description: `Moved ${toMove.length} statement(s) from lines ${p.startLine}-${p.endLine} into function '${p.target}'`,
    diff: [],
  };
}

export const moveStatementsIntoFunction: RefactoringDefinition = {
  name: "Move Statements Into Function",
  kebabName: "move-statements-into-function",
  description: "Moves a range of top-level statements into an existing function body.",
  tier: 2,
  params,
  preconditions: (project: Project, raw: unknown): PreconditionResult =>
    preconditions(project, params.validate(raw) as MoveStatementsIntoFunctionParams),
  apply: (project: Project, raw: unknown): RefactoringResult =>
    apply(project, params.validate(raw) as MoveStatementsIntoFunctionParams),
};
