import { SyntaxKind } from "ts-morph";
import type { Project } from "ts-morph";
import type {
  RefactoringDefinition,
  ParamSchema,
  PreconditionResult,
  RefactoringResult,
} from "../../engine/refactoring.types.js";

interface ReplaceFunctionWithCommandParams {
  file: string;
  target: string;
  className: string;
}

const params: ParamSchema = {
  definitions: [
    { name: "file", type: "string", description: "Path to the TypeScript file", required: true },
    {
      name: "target",
      type: "string",
      description: "Name of the function to convert into a command class",
      required: true,
    },
    {
      name: "className",
      type: "string",
      description: "Name for the new command class",
      required: true,
    },
  ],
  validate(raw: unknown): ReplaceFunctionWithCommandParams {
    const r = raw as Record<string, unknown>;
    if (typeof r["file"] !== "string" || r["file"].trim() === "") {
      throw new Error("param 'file' must be a non-empty string");
    }
    if (typeof r["target"] !== "string" || r["target"].trim() === "") {
      throw new Error("param 'target' must be a non-empty string");
    }
    if (typeof r["className"] !== "string" || r["className"].trim() === "") {
      throw new Error("param 'className' must be a non-empty string");
    }
    return {
      file: r["file"] as string,
      target: r["target"] as string,
      className: r["className"] as string,
    };
  },
};

function preconditions(project: Project, p: ReplaceFunctionWithCommandParams): PreconditionResult {
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

  const existing = sf
    .getDescendantsOfKind(SyntaxKind.ClassDeclaration)
    .find((c) => c.getName() === p.className);
  if (existing) {
    errors.push(`A class named '${p.className}' already exists in the file`);
  }

  return { ok: errors.length === 0, errors };
}

function apply(project: Project, p: ReplaceFunctionWithCommandParams): RefactoringResult {
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

  const fnParams = fn.getParameters();
  const returnTypeNode = fn.getReturnTypeNode();
  const returnType = returnTypeNode ? returnTypeNode.getText() : "void";
  const body = fn.getBody();
  const bodyText = body ? body.getText() : "{}";

  // Build constructor parameters and field declarations
  const fieldDeclarations = fnParams
    .map((ep) => {
      const typeNode = ep.getTypeNode();
      const typeName = typeNode ? typeNode.getText() : "unknown";
      return `  private readonly ${ep.getName()}: ${typeName};`;
    })
    .join("\n");

  const constructorParamList = fnParams
    .map((ep) => {
      const typeNode = ep.getTypeNode();
      const typeName = typeNode ? typeNode.getText() : "unknown";
      return `${ep.getName()}: ${typeName}`;
    })
    .join(", ");

  const constructorAssignments = fnParams
    .map((ep) => `    this.${ep.getName()} = ${ep.getName()};`)
    .join("\n");

  // Replace param references in body with this.param
  let executeBody = bodyText;
  for (const ep of fnParams) {
    const name = ep.getName();
    executeBody = executeBody.replace(new RegExp(`\\b${name}\\b`, "g"), `this.${name}`);
  }

  const classText = [
    `class ${p.className} {`,
    fieldDeclarations,
    `  constructor(${constructorParamList}) {`,
    constructorAssignments,
    `  }`,
    `  execute(): ${returnType} ${executeBody}`,
    `}`,
  ]
    .filter((line) => line.trim() !== "")
    .join("\n");

  // Remove the original function
  fn.remove();

  // Add the command class at the end of the file
  sf.addStatements(`\n${classText}\n`);

  return {
    success: true,
    filesChanged: [p.file],
    description: `Converted function '${p.target}' into command class '${p.className}'`,
  };
}

export const replaceFunctionWithCommand: RefactoringDefinition = {
  name: "Replace Function With Command",
  kebabName: "replace-function-with-command",
  description:
    "Converts a standalone function into a command class with an execute method, enabling richer state management.",
  tier: 2,
  params,
  preconditions: (project: Project, raw: unknown): PreconditionResult =>
    preconditions(project, params.validate(raw) as ReplaceFunctionWithCommandParams),
  apply: (project: Project, raw: unknown): RefactoringResult =>
    apply(project, params.validate(raw) as ReplaceFunctionWithCommandParams),
};
