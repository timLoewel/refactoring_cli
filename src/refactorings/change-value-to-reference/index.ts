import { SyntaxKind } from "ts-morph";
import type { Project } from "ts-morph";
import type {
  RefactoringDefinition,
  ParamSchema,
  PreconditionResult,
  RefactoringResult,
} from "../../engine/refactoring.types.js";

interface ChangeValueToReferenceParams {
  file: string;
  target: string;
}

const params: ParamSchema = {
  definitions: [
    { name: "file", type: "string", description: "Path to the TypeScript file", required: true },
    {
      name: "target",
      type: "string",
      description: "Name of the class to convert to reference semantics",
      required: true,
    },
  ],
  validate(raw: unknown): ChangeValueToReferenceParams {
    const r = raw as Record<string, unknown>;
    if (typeof r["file"] !== "string" || r["file"].trim() === "") {
      throw new Error("param 'file' must be a non-empty string");
    }
    if (typeof r["target"] !== "string" || r["target"].trim() === "") {
      throw new Error("param 'target' must be a non-empty string");
    }
    return { file: r["file"] as string, target: r["target"] as string };
  },
};

function preconditions(project: Project, p: ChangeValueToReferenceParams): PreconditionResult {
  const errors: string[] = [];

  const sf = project.getSourceFile(p.file);
  if (!sf) {
    errors.push(`File not found in project: ${p.file}`);
    return { ok: false, errors };
  }

  const targetClass = sf
    .getDescendantsOfKind(SyntaxKind.ClassDeclaration)
    .find((c) => c.getName() === p.target);
  if (!targetClass) {
    errors.push(`Class '${p.target}' not found in file: ${p.file}`);
  }

  return { ok: errors.length === 0, errors };
}

function buildRegistryMethod(className: string, keyParam: string): string {
  return (
    `  private static _registry: Map<string, ${className}> = new Map();\n\n` +
    `  static getInstance(${keyParam}: string): ${className} {\n` +
    `    if (!${className}._registry.has(${keyParam})) {\n` +
    `      ${className}._registry.set(${keyParam}, new ${className}(${keyParam}));\n` +
    `    }\n` +
    `    return ${className}._registry.get(${keyParam}) as ${className};\n` +
    `  }`
  );
}

function apply(project: Project, p: ChangeValueToReferenceParams): RefactoringResult {
  const sf = project.getSourceFile(p.file);
  if (!sf) {
    return { success: false, filesChanged: [], description: `File not found: ${p.file}` };
  }

  const targetClass = sf
    .getDescendantsOfKind(SyntaxKind.ClassDeclaration)
    .find((c) => c.getName() === p.target);
  if (!targetClass) {
    return {
      success: false,
      filesChanged: [],
      description: `Class '${p.target}' not found`,
    };
  }

  // Determine key parameter name from first constructor parameter, fall back to "id"
  const ctor = targetClass.getConstructors()[0];
  const keyParam = ctor?.getParameters()[0]?.getName() ?? "id";

  const registryMethod = buildRegistryMethod(p.target, keyParam);
  targetClass.addMember(registryMethod);

  return {
    success: true,
    filesChanged: [p.file],
    description: `Added getInstance() factory with registry to class '${p.target}' for reference semantics`,
  };
}

export const changeValueToReference: RefactoringDefinition = {
  name: "Change Value To Reference",
  kebabName: "change-value-to-reference",
  description:
    "Adds a static getInstance() factory method with an internal registry to a class, enabling shared reference semantics.",
  tier: 3,
  params,
  preconditions: (project: Project, raw: unknown): PreconditionResult =>
    preconditions(project, params.validate(raw) as ChangeValueToReferenceParams),
  apply: (project: Project, raw: unknown): RefactoringResult =>
    apply(project, params.validate(raw) as ChangeValueToReferenceParams),
};
