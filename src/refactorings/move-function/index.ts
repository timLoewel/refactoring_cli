import { SyntaxKind } from "ts-morph";
import type { Project } from "ts-morph";
import type {
  RefactoringDefinition,
  ParamSchema,
  PreconditionResult,
  RefactoringResult,
} from "../../engine/refactoring.types.js";

interface MoveFunctionParams {
  file: string;
  target: string;
  destination: string;
}

const params: ParamSchema = {
  definitions: [
    { name: "file", type: "string", description: "Path to the TypeScript file", required: true },
    {
      name: "target",
      type: "string",
      description: "Name of the function to move",
      required: true,
    },
    {
      name: "destination",
      type: "string",
      description: "Destination file path (must already exist in the project)",
      required: true,
    },
  ],
  validate(raw: unknown): MoveFunctionParams {
    const r = raw as Record<string, unknown>;
    if (typeof r["file"] !== "string" || r["file"].trim() === "") {
      throw new Error("param 'file' must be a non-empty string");
    }
    if (typeof r["target"] !== "string" || r["target"].trim() === "") {
      throw new Error("param 'target' must be a non-empty string");
    }
    if (typeof r["destination"] !== "string" || r["destination"].trim() === "") {
      throw new Error("param 'destination' must be a non-empty string");
    }
    return {
      file: r["file"] as string,
      target: r["target"] as string,
      destination: r["destination"] as string,
    };
  },
};

function preconditions(project: Project, p: MoveFunctionParams): PreconditionResult {
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

  const destSf = project.getSourceFile(p.destination);
  if (!destSf) {
    errors.push(`Destination file not found in project: ${p.destination}`);
  } else {
    const existing = destSf
      .getDescendantsOfKind(SyntaxKind.FunctionDeclaration)
      .find((f) => f.getName() === p.target);
    if (existing) {
      errors.push(`Function '${p.target}' already exists in destination file`);
    }
  }

  if (p.file === p.destination) {
    errors.push("'file' and 'destination' must be different files");
  }

  return { ok: errors.length === 0, errors };
}

function apply(project: Project, p: MoveFunctionParams): RefactoringResult {
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

  const destSf = project.getSourceFile(p.destination);
  if (!destSf) {
    return {
      success: false,
      filesChanged: [],
      description: `Destination file not found: ${p.destination}`,
      diff: [],
    };
  }

  const functionText = fn.getText();
  fn.remove();
  destSf.addStatements(`\n${functionText}`);

  return {
    success: true,
    filesChanged: [p.file, p.destination],
    description: `Moved function '${p.target}' from '${p.file}' to '${p.destination}'`,
    diff: [],
  };
}

export const moveFunction: RefactoringDefinition = {
  name: "Move Function",
  kebabName: "move-function",
  description: "Moves a function declaration from one file to another file in the project.",
  tier: 3,
  params,
  preconditions: (project: Project, raw: unknown): PreconditionResult =>
    preconditions(project, params.validate(raw) as MoveFunctionParams),
  apply: (project: Project, raw: unknown): RefactoringResult =>
    apply(project, params.validate(raw) as MoveFunctionParams),
};
