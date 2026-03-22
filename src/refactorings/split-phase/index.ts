import { SyntaxKind, Node } from "ts-morph";
import type { Project, Statement } from "ts-morph";
import type {
  RefactoringDefinition,
  ParamSchema,
  PreconditionResult,
  RefactoringResult,
} from "../../engine/refactoring.types.js";

interface SplitPhaseParams {
  file: string;
  target: string;
  firstPhaseName: string;
  secondPhaseName: string;
}

const params: ParamSchema = {
  definitions: [
    { name: "file", type: "string", description: "Path to the TypeScript file", required: true },
    {
      name: "target",
      type: "string",
      description: "Name of the function to split into two phases",
      required: true,
    },
    {
      name: "firstPhaseName",
      type: "string",
      description: "Name for the first phase function",
      required: true,
    },
    {
      name: "secondPhaseName",
      type: "string",
      description: "Name for the second phase function",
      required: true,
    },
  ],
  validate(raw: unknown): SplitPhaseParams {
    const r = raw as Record<string, unknown>;
    if (typeof r["file"] !== "string" || r["file"].trim() === "") {
      throw new Error("param 'file' must be a non-empty string");
    }
    if (typeof r["target"] !== "string" || r["target"].trim() === "") {
      throw new Error("param 'target' must be a non-empty string");
    }
    if (typeof r["firstPhaseName"] !== "string" || r["firstPhaseName"].trim() === "") {
      throw new Error("param 'firstPhaseName' must be a non-empty string");
    }
    if (typeof r["secondPhaseName"] !== "string" || r["secondPhaseName"].trim() === "") {
      throw new Error("param 'secondPhaseName' must be a non-empty string");
    }
    return {
      file: r["file"] as string,
      target: r["target"] as string,
      firstPhaseName: r["firstPhaseName"] as string,
      secondPhaseName: r["secondPhaseName"] as string,
    };
  },
};

function preconditions(project: Project, p: SplitPhaseParams): PreconditionResult {
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
  const bodyStmtCount = body && Node.isBlock(body) ? body.getStatements().length : 0;
  if (!body || bodyStmtCount < 2) {
    errors.push(`Function '${p.target}' must have at least 2 statements to split into two phases`);
  }

  for (const phaseName of [p.firstPhaseName, p.secondPhaseName]) {
    const conflict = sf
      .getDescendantsOfKind(SyntaxKind.FunctionDeclaration)
      .find((f) => f.getName() === phaseName);
    if (conflict) {
      errors.push(`A function named '${phaseName}' already exists in the file`);
    }
  }

  return { ok: errors.length === 0, errors };
}

function apply(project: Project, p: SplitPhaseParams): RefactoringResult {
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

  if (!Node.isBlock(body)) {
    return {
      success: false,
      filesChanged: [],
      description: `Function '${p.target}' body is not a block`,
    };
  }
  const stmts = body.getStatements();
  if (stmts.length < 2) {
    return {
      success: false,
      filesChanged: [],
      description: `Function '${p.target}' needs at least 2 statements`,
    };
  }

  const paramText = fn
    .getParameters()
    .map((par) => par.getText())
    .join(", ");
  const midpoint = Math.floor(stmts.length / 2);

  const firstStatements = stmts
    .slice(0, midpoint)
    .map((s: Statement) => `  ${s.getText()}`)
    .join("\n");
  const secondStatements = stmts
    .slice(midpoint)
    .map((s: Statement) => `  ${s.getText()}`)
    .join("\n");

  const firstFunc = `\nfunction ${p.firstPhaseName}(${paramText}): void {\n${firstStatements}\n}\n`;
  const secondFunc = `\nfunction ${p.secondPhaseName}(${paramText}): void {\n${secondStatements}\n}\n`;

  // Replace the body of the original function with calls to both phases
  const argNames = fn
    .getParameters()
    .map((par) => par.getName())
    .join(", ");
  body.replaceWithText(
    `{\n  ${p.firstPhaseName}(${argNames});\n  ${p.secondPhaseName}(${argNames});\n}`,
  );

  sf.addStatements(firstFunc);
  sf.addStatements(secondFunc);

  return {
    success: true,
    filesChanged: [p.file],
    description: `Split function '${p.target}' into '${p.firstPhaseName}' and '${p.secondPhaseName}'`,
  };
}

export const splitPhase: RefactoringDefinition = {
  name: "Split Phase",
  kebabName: "split-phase",
  description:
    "Splits a function into two sequential phase functions and updates the original to delegate to them.",
  tier: 2,
  params,
  preconditions: (project: Project, raw: unknown): PreconditionResult =>
    preconditions(project, params.validate(raw) as SplitPhaseParams),
  apply: (project: Project, raw: unknown): RefactoringResult =>
    apply(project, params.validate(raw) as SplitPhaseParams),
};
