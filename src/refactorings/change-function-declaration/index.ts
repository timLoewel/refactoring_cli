import { SyntaxKind } from "ts-morph";
import type { Project } from "ts-morph";
import type {
  RefactoringDefinition,
  ParamSchema,
  PreconditionResult,
  RefactoringResult,
} from "../../engine/refactoring.types.js";

interface ChangeFunctionDeclarationParams {
  file: string;
  target: string;
  name: string;
}

const params: ParamSchema = {
  definitions: [
    { name: "file", type: "string", description: "Path to the TypeScript file", required: true },
    {
      name: "target",
      type: "string",
      description: "Current name of the function to rename",
      required: true,
    },
    { name: "name", type: "string", description: "New name for the function", required: true },
  ],
  validate(raw: unknown): ChangeFunctionDeclarationParams {
    const r = raw as Record<string, unknown>;
    if (typeof r["file"] !== "string" || r["file"].trim() === "") {
      throw new Error("param 'file' must be a non-empty string");
    }
    if (typeof r["target"] !== "string" || r["target"].trim() === "") {
      throw new Error("param 'target' must be a non-empty string");
    }
    if (typeof r["name"] !== "string" || r["name"].trim() === "") {
      throw new Error("param 'name' must be a non-empty string");
    }
    return {
      file: r["file"] as string,
      target: r["target"] as string,
      name: r["name"] as string,
    };
  },
};

function preconditions(project: Project, p: ChangeFunctionDeclarationParams): PreconditionResult {
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
  }

  const conflict = sf
    .getDescendantsOfKind(SyntaxKind.FunctionDeclaration)
    .find((f) => f.getName() === p.name);
  if (conflict) {
    errors.push(`A function named '${p.name}' already exists in the file`);
  }

  return { ok: errors.length === 0, errors };
}

function apply(project: Project, p: ChangeFunctionDeclarationParams): RefactoringResult {
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

  // Rename all identifiers referencing the old name
  const identifiers = sf
    .getDescendantsOfKind(SyntaxKind.Identifier)
    .filter((id) => id.getText() === p.target);
  const sorted = [...identifiers].sort((a, b) => b.getStart() - a.getStart());
  for (const id of sorted) {
    id.replaceWithText(p.name);
  }

  return {
    success: true,
    filesChanged: [p.file],
    description: `Renamed function '${p.target}' to '${p.name}' and updated ${sorted.length} reference(s)`,
    diff: [],
  };
}

export const changeFunctionDeclaration: RefactoringDefinition = {
  name: "Change Function Declaration",
  kebabName: "change-function-declaration",
  description: "Renames a function and updates all call sites within the file.",
  tier: 2,
  params,
  preconditions: (project: Project, raw: unknown): PreconditionResult =>
    preconditions(project, params.validate(raw) as ChangeFunctionDeclarationParams),
  apply: (project: Project, raw: unknown): RefactoringResult =>
    apply(project, params.validate(raw) as ChangeFunctionDeclarationParams),
};
