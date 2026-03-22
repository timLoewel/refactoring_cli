import { SyntaxKind } from "ts-morph";
import type { Project } from "ts-morph";
import type {
  RefactoringDefinition,
  ParamSchema,
  PreconditionResult,
  RefactoringResult,
} from "../../engine/refactoring.types.js";

interface ParameterizeFunctionParams {
  file: string;
  target: string;
  paramName: string;
  paramType: string;
}

const params: ParamSchema = {
  definitions: [
    { name: "file", type: "string", description: "Path to the TypeScript file", required: true },
    {
      name: "target",
      type: "string",
      description: "Name of the function to add a parameter to",
      required: true,
    },
    { name: "paramName", type: "string", description: "Name of the new parameter", required: true },
    {
      name: "paramType",
      type: "string",
      description: "TypeScript type of the new parameter",
      required: true,
    },
  ],
  validate(raw: unknown): ParameterizeFunctionParams {
    const r = raw as Record<string, unknown>;
    if (typeof r["file"] !== "string" || r["file"].trim() === "") {
      throw new Error("param 'file' must be a non-empty string");
    }
    if (typeof r["target"] !== "string" || r["target"].trim() === "") {
      throw new Error("param 'target' must be a non-empty string");
    }
    if (typeof r["paramName"] !== "string" || r["paramName"].trim() === "") {
      throw new Error("param 'paramName' must be a non-empty string");
    }
    if (typeof r["paramType"] !== "string" || r["paramType"].trim() === "") {
      throw new Error("param 'paramType' must be a non-empty string");
    }
    return {
      file: r["file"] as string,
      target: r["target"] as string,
      paramName: r["paramName"] as string,
      paramType: r["paramType"] as string,
    };
  },
};

function preconditions(project: Project, p: ParameterizeFunctionParams): PreconditionResult {
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

  const existing = fn.getParameters().find((param) => param.getName() === p.paramName);
  if (existing) {
    errors.push(`Function '${p.target}' already has a parameter named '${p.paramName}'`);
  }

  return { ok: errors.length === 0, errors };
}

function apply(project: Project, p: ParameterizeFunctionParams): RefactoringResult {
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

  // Add the new parameter at the end of the parameter list
  fn.addParameter({ name: p.paramName, type: p.paramType });

  // Update all call sites to pass undefined for the new parameter
  const calls = sf.getDescendantsOfKind(SyntaxKind.CallExpression).filter((c) => {
    return c.getExpression().getText() === p.target;
  });

  const sorted = [...calls].sort((a, b) => b.getStart() - a.getStart());
  for (const call of sorted) {
    call.addArgument("undefined");
  }

  return {
    success: true,
    filesChanged: [p.file],
    description: `Added parameter '${p.paramName}: ${p.paramType}' to function '${p.target}' and updated ${sorted.length} call site(s)`,
  };
}

export const parameterizeFunction: RefactoringDefinition = {
  name: "Parameterize Function",
  kebabName: "parameterize-function",
  description: "Adds a new parameter to a function and updates all call sites within the file.",
  tier: 2,
  params,
  preconditions: (project: Project, raw: unknown): PreconditionResult =>
    preconditions(project, params.validate(raw) as ParameterizeFunctionParams),
  apply: (project: Project, raw: unknown): RefactoringResult =>
    apply(project, params.validate(raw) as ParameterizeFunctionParams),
};
