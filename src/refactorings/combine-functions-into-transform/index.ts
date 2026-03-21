import { SyntaxKind } from "ts-morph";
import type { Project } from "ts-morph";
import type {
  RefactoringDefinition,
  ParamSchema,
  PreconditionResult,
  RefactoringResult,
} from "../../engine/refactoring.types.js";

interface CombineFunctionsIntoTransformParams {
  file: string;
  functions: string;
  name: string;
}

const params: ParamSchema = {
  definitions: [
    { name: "file", type: "string", description: "Path to the TypeScript file", required: true },
    {
      name: "functions",
      type: "string",
      description: "Comma-separated list of function names to combine",
      required: true,
    },
    {
      name: "name",
      type: "string",
      description: "Name of the new transform function",
      required: true,
    },
  ],
  validate(raw: unknown): CombineFunctionsIntoTransformParams {
    const r = raw as Record<string, unknown>;
    if (typeof r["file"] !== "string" || r["file"].trim() === "") {
      throw new Error("param 'file' must be a non-empty string");
    }
    if (typeof r["functions"] !== "string" || r["functions"].trim() === "") {
      throw new Error("param 'functions' must be a non-empty comma-separated string");
    }
    if (typeof r["name"] !== "string" || r["name"].trim() === "") {
      throw new Error("param 'name' must be a non-empty string");
    }
    return {
      file: r["file"] as string,
      functions: r["functions"] as string,
      name: r["name"] as string,
    };
  },
};

function preconditions(
  project: Project,
  p: CombineFunctionsIntoTransformParams,
): PreconditionResult {
  const errors: string[] = [];

  const sf = project.getSourceFile(p.file);
  if (!sf) {
    errors.push(`File not found in project: ${p.file}`);
    return { ok: false, errors };
  }

  const names = p.functions
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);
  if (names.length < 2) {
    errors.push("At least two function names must be provided");
  }

  for (const fnName of names) {
    const fn = sf
      .getDescendantsOfKind(SyntaxKind.FunctionDeclaration)
      .find((f) => f.getName() === fnName);
    if (!fn) {
      errors.push(`Function '${fnName}' not found in file: ${p.file}`);
    }
  }

  const conflict = sf
    .getDescendantsOfKind(SyntaxKind.FunctionDeclaration)
    .find((f) => f.getName() === p.name);
  if (conflict) {
    errors.push(`A function named '${p.name}' already exists in the file`);
  }

  return { ok: errors.length === 0, errors };
}

function apply(project: Project, p: CombineFunctionsIntoTransformParams): RefactoringResult {
  const sf = project.getSourceFile(p.file);
  if (!sf) {
    return { success: false, filesChanged: [], description: `File not found: ${p.file}`, diff: [] };
  }

  const names = p.functions
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);
  const fns = names
    .map((fnName) =>
      sf.getDescendantsOfKind(SyntaxKind.FunctionDeclaration).find((f) => f.getName() === fnName),
    )
    .filter((f): f is NonNullable<typeof f> => f !== undefined);

  if (fns.length !== names.length) {
    return {
      success: false,
      filesChanged: [],
      description: "One or more specified functions were not found",
      diff: [],
    };
  }

  // Collect all parameters (de-duplicated by name)
  const seenParams = new Set<string>();
  const allParams: string[] = [];
  for (const fn of fns) {
    for (const param of fn.getParameters()) {
      if (!seenParams.has(param.getName())) {
        seenParams.add(param.getName());
        allParams.push(param.getText());
      }
    }
  }

  // Build the transform body: call each function in sequence
  const callLines = names.map((fnName) => {
    const fn = fns.find((f) => f.getName() === fnName);
    if (!fn) return "";
    const argNames = fn
      .getParameters()
      .map((par) => par.getName())
      .join(", ");
    return `  ${fnName}(${argNames});`;
  });

  const transformText = `\nfunction ${p.name}(${allParams.join(", ")}): void {\n${callLines.join("\n")}\n}\n`;
  sf.addStatements(transformText);

  return {
    success: true,
    filesChanged: [p.file],
    description: `Created transform function '${p.name}' that combines: ${names.join(", ")}`,
    diff: [],
  };
}

export const combineFunctionsIntoTransform: RefactoringDefinition = {
  name: "Combine Functions Into Transform",
  kebabName: "combine-functions-into-transform",
  description:
    "Creates a new transform function that calls a set of existing functions in sequence.",
  tier: 2,
  params,
  preconditions: (project: Project, raw: unknown): PreconditionResult =>
    preconditions(project, params.validate(raw) as CombineFunctionsIntoTransformParams),
  apply: (project: Project, raw: unknown): RefactoringResult =>
    apply(project, params.validate(raw) as CombineFunctionsIntoTransformParams),
};
