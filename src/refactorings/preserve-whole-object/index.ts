import { SyntaxKind } from "ts-morph";
import type { Project } from "ts-morph";
import type {
  RefactoringDefinition,
  ParamSchema,
  PreconditionResult,
  RefactoringResult,
} from "../../engine/refactoring.types.js";

interface PreserveWholeObjectParams {
  file: string;
  target: string;
}

const params: ParamSchema = {
  definitions: [
    { name: "file", type: "string", description: "Path to the TypeScript file", required: true },
    {
      name: "target",
      type: "string",
      description: "Name of the function to inspect",
      required: true,
    },
  ],
  validate(raw: unknown): PreserveWholeObjectParams {
    const r = raw as Record<string, unknown>;
    if (typeof r["file"] !== "string" || r["file"].trim() === "") {
      throw new Error("param 'file' must be a non-empty string");
    }
    if (typeof r["target"] !== "string" || r["target"].trim() === "") {
      throw new Error("param 'target' must be a non-empty string");
    }
    return {
      file: r["file"] as string,
      target: r["target"] as string,
    };
  },
};

function preconditions(project: Project, p: PreserveWholeObjectParams): PreconditionResult {
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

  const paramCount = fn.getParameters().length;
  if (paramCount < 2) {
    errors.push(
      `Function '${p.target}' must have at least 2 parameters to apply preserve-whole-object`,
    );
  }

  return { ok: errors.length === 0, errors };
}

function apply(project: Project, p: PreserveWholeObjectParams): RefactoringResult {
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

  const existingParams = fn.getParameters();
  if (existingParams.length < 2) {
    return {
      success: false,
      filesChanged: [],
      description: `Function '${p.target}' needs at least 2 parameters`,
      diff: [],
    };
  }

  // Build a record type from existing parameters and replace them with a single object param
  const paramNames = existingParams.map((ep) => ep.getName());
  const paramTypes = existingParams.map((ep) => {
    const typeNode = ep.getTypeNode();
    return typeNode ? typeNode.getText() : "unknown";
  });

  const typeLiteralParts = paramNames.map((name, i) => `${name}: ${paramTypes[i]}`);
  const objectType = `{ ${typeLiteralParts.join("; ")} }`;

  // Remove existing parameters in reverse order
  const sorted = [...existingParams].sort((a, b) => b.getChildIndex() - a.getChildIndex());
  for (const ep of sorted) {
    ep.remove();
  }

  // Add single object parameter
  fn.addParameter({ name: "obj", type: objectType });

  // Replace usages of individual param names with obj.paramName in function body
  const body = fn.getBody();
  if (body) {
    const identifiers = body.getDescendantsOfKind(SyntaxKind.Identifier);
    const sorted2 = [...identifiers].sort((a, b) => b.getStart() - a.getStart());
    for (const id of sorted2) {
      if (paramNames.includes(id.getText())) {
        id.replaceWithText(`obj.${id.getText()}`);
      }
    }
  }

  return {
    success: true,
    filesChanged: [p.file],
    description: `Replaced ${paramNames.length} parameters of '${p.target}' with a single object parameter`,
    diff: [],
  };
}

export const preserveWholeObject: RefactoringDefinition = {
  name: "Preserve Whole Object",
  kebabName: "preserve-whole-object",
  description:
    "Replaces multiple parameters derived from one object with the whole object passed as a single parameter.",
  tier: 2,
  params,
  preconditions: (project: Project, raw: unknown): PreconditionResult =>
    preconditions(project, params.validate(raw) as PreserveWholeObjectParams),
  apply: (project: Project, raw: unknown): RefactoringResult =>
    apply(project, params.validate(raw) as PreserveWholeObjectParams),
};
