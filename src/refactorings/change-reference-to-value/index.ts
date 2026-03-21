import { SyntaxKind } from "ts-morph";
import type { Project, ClassDeclaration } from "ts-morph";
import type {
  RefactoringDefinition,
  ParamSchema,
  PreconditionResult,
  RefactoringResult,
} from "../../engine/refactoring.types.js";

interface ChangeReferenceToValueParams {
  file: string;
  target: string;
}

const params: ParamSchema = {
  definitions: [
    { name: "file", type: "string", description: "Path to the TypeScript file", required: true },
    {
      name: "target",
      type: "string",
      description: "Name of the class to convert to a value object",
      required: true,
    },
  ],
  validate(raw: unknown): ChangeReferenceToValueParams {
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

function preconditions(project: Project, p: ChangeReferenceToValueParams): PreconditionResult {
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

function makeFieldsReadonly(targetClass: ClassDeclaration): string[] {
  const fieldNames: string[] = [];
  for (const prop of targetClass.getProperties()) {
    prop.setIsReadonly(true);
    fieldNames.push(prop.getName());
  }
  return fieldNames;
}

function buildEqualsMethod(fieldNames: string[], className: string): string {
  const comparisons = fieldNames.map((name) => `this.${name} === other.${name}`).join(" && ");
  const body =
    fieldNames.length > 0
      ? `return other instanceof ${className} && ${comparisons};`
      : `return other instanceof ${className};`;
  return `  equals(other: unknown): boolean {\n    ${body}\n  }`;
}

function apply(project: Project, p: ChangeReferenceToValueParams): RefactoringResult {
  const sf = project.getSourceFile(p.file);
  if (!sf) {
    return { success: false, filesChanged: [], description: `File not found: ${p.file}`, diff: [] };
  }

  const targetClass = sf
    .getDescendantsOfKind(SyntaxKind.ClassDeclaration)
    .find((c) => c.getName() === p.target);
  if (!targetClass) {
    return {
      success: false,
      filesChanged: [],
      description: `Class '${p.target}' not found`,
      diff: [],
    };
  }

  const fieldNames = makeFieldsReadonly(targetClass);
  const equalsMethod = buildEqualsMethod(fieldNames, p.target);
  targetClass.addMember(equalsMethod);

  return {
    success: true,
    filesChanged: [p.file],
    description: `Converted class '${p.target}' to value object: made ${fieldNames.length} field(s) readonly and added equals()`,
    diff: [],
  };
}

export const changeReferenceToValue: RefactoringDefinition = {
  name: "Change Reference To Value",
  kebabName: "change-reference-to-value",
  description:
    "Converts a reference object into a value object by making fields readonly and adding an equals method.",
  tier: 3,
  params,
  preconditions: (project: Project, raw: unknown): PreconditionResult =>
    preconditions(project, params.validate(raw) as ChangeReferenceToValueParams),
  apply: (project: Project, raw: unknown): RefactoringResult =>
    apply(project, params.validate(raw) as ChangeReferenceToValueParams),
};
