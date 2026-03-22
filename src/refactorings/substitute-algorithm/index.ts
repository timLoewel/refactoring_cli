import { SyntaxKind } from "ts-morph";
import type { Project } from "ts-morph";
import type {
  RefactoringDefinition,
  ParamSchema,
  PreconditionResult,
  RefactoringResult,
} from "../../engine/refactoring.types.js";

interface SubstituteAlgorithmParams {
  file: string;
  target: string;
  newBody: string;
}

const params: ParamSchema = {
  definitions: [
    { name: "file", type: "string", description: "Path to the TypeScript file", required: true },
    {
      name: "target",
      type: "string",
      description: "Name of the function whose body should be replaced",
      required: true,
    },
    {
      name: "newBody",
      type: "string",
      description: "New function body as a block string (e.g. '{ return x * 2; }')",
      required: true,
    },
  ],
  validate(raw: unknown): SubstituteAlgorithmParams {
    const r = raw as Record<string, unknown>;
    if (typeof r["file"] !== "string" || r["file"].trim() === "") {
      throw new Error("param 'file' must be a non-empty string");
    }
    if (typeof r["target"] !== "string" || r["target"].trim() === "") {
      throw new Error("param 'target' must be a non-empty string");
    }
    if (typeof r["newBody"] !== "string" || r["newBody"].trim() === "") {
      throw new Error("param 'newBody' must be a non-empty string");
    }
    return {
      file: r["file"] as string,
      target: r["target"] as string,
      newBody: r["newBody"] as string,
    };
  },
};

function preconditions(project: Project, p: SubstituteAlgorithmParams): PreconditionResult {
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
    errors.push(`Function '${p.target}' has no body to substitute`);
  }

  const trimmed = p.newBody.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    errors.push("param 'newBody' must be a block statement wrapped in curly braces");
  }

  return { ok: errors.length === 0, errors };
}

function apply(project: Project, p: SubstituteAlgorithmParams): RefactoringResult {
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

  const trimmed = p.newBody.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    return {
      success: false,
      filesChanged: [],
      description: "newBody must be a block statement wrapped in curly braces",
    };
  }

  // Replace the body with the new body text
  body.replaceWithText(trimmed);

  return {
    success: true,
    filesChanged: [p.file],
    description: `Replaced body of function '${p.target}' with the new algorithm`,
  };
}

export const substituteAlgorithm: RefactoringDefinition = {
  name: "Substitute Algorithm",
  kebabName: "substitute-algorithm",
  description: "Replaces the entire body of a function with a new implementation.",
  tier: 2,
  params,
  preconditions: (project: Project, raw: unknown): PreconditionResult =>
    preconditions(project, params.validate(raw) as SubstituteAlgorithmParams),
  apply: (project: Project, raw: unknown): RefactoringResult =>
    apply(project, params.validate(raw) as SubstituteAlgorithmParams),
};
