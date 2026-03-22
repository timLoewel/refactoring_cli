import { SyntaxKind } from "ts-morph";
import type { Project } from "ts-morph";
import type {
  RefactoringDefinition,
  ParamSchema,
  PreconditionResult,
  RefactoringResult,
} from "../../engine/refactoring.types.js";

interface ReplacePrimitiveWithObjectParams {
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
      description: "Name of the variable or parameter to wrap",
      required: true,
    },
    {
      name: "className",
      type: "string",
      description: "Name of the wrapper class to create",
      required: true,
    },
  ],
  validate(raw: unknown): ReplacePrimitiveWithObjectParams {
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

function preconditions(project: Project, p: ReplacePrimitiveWithObjectParams): PreconditionResult {
  const errors: string[] = [];

  const sf = project.getSourceFile(p.file);
  if (!sf) {
    errors.push(`File not found in project: ${p.file}`);
    return { ok: false, errors };
  }

  const existing = sf
    .getDescendantsOfKind(SyntaxKind.ClassDeclaration)
    .find((c) => c.getName() === p.className);
  if (existing) {
    errors.push(`Class '${p.className}' already exists in file`);
  }

  const varDecl = sf.getVariableDeclaration(p.target);
  if (!varDecl) {
    errors.push(`Variable '${p.target}' not found at module level in file: ${p.file}`);
  }

  return { ok: errors.length === 0, errors };
}

function buildWrapperClass(className: string, primitiveType: string): string {
  return (
    `\nclass ${className} {\n` +
    `  private readonly _value: ${primitiveType};\n\n` +
    `  constructor(value: ${primitiveType}) {\n    this._value = value;\n  }\n\n` +
    `  getValue(): ${primitiveType} { return this._value; }\n\n` +
    `  toString(): string { return String(this._value); }\n` +
    `}\n`
  );
}

function apply(project: Project, p: ReplacePrimitiveWithObjectParams): RefactoringResult {
  const sf = project.getSourceFile(p.file);
  if (!sf) {
    return { success: false, filesChanged: [], description: `File not found: ${p.file}` };
  }

  const varDecl = sf.getVariableDeclaration(p.target);
  if (!varDecl) {
    return {
      success: false,
      filesChanged: [],
      description: `Variable '${p.target}' not found`,
    };
  }

  const primitiveType = varDecl.getTypeNode()?.getText() ?? "unknown";
  const initializerText = varDecl.getInitializer()?.getText() ?? "undefined";

  sf.addStatements(buildWrapperClass(p.className, primitiveType));

  varDecl.setType(p.className);
  varDecl.setInitializer(`new ${p.className}(${initializerText})`);

  return {
    success: true,
    filesChanged: [p.file],
    description: `Wrapped primitive variable '${p.target}' in new class '${p.className}'`,
  };
}

export const replacePrimitiveWithObject: RefactoringDefinition = {
  name: "Replace Primitive With Object",
  kebabName: "replace-primitive-with-object",
  description:
    "Creates a wrapper class for a primitive-typed variable, replacing its usage with an instance of the class.",
  tier: 3,
  params,
  preconditions: (project: Project, raw: unknown): PreconditionResult =>
    preconditions(project, params.validate(raw) as ReplacePrimitiveWithObjectParams),
  apply: (project: Project, raw: unknown): RefactoringResult =>
    apply(project, params.validate(raw) as ReplacePrimitiveWithObjectParams),
};
