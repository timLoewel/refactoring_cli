import { SyntaxKind } from "ts-morph";
import type { Project } from "ts-morph";
import type {
  RefactoringDefinition,
  ParamSchema,
  PreconditionResult,
  RefactoringResult,
} from "../../engine/refactoring.types.js";

interface RemoveSettingMethodParams {
  file: string;
  target: string;
  field: string;
}

const params: ParamSchema = {
  definitions: [
    { name: "file", type: "string", description: "Path to the TypeScript file", required: true },
    {
      name: "target",
      type: "string",
      description: "Name of the class containing the setter",
      required: true,
    },
    {
      name: "field",
      type: "string",
      description: "Name of the field whose setter should be removed",
      required: true,
    },
  ],
  validate(raw: unknown): RemoveSettingMethodParams {
    const r = raw as Record<string, unknown>;
    if (typeof r["file"] !== "string" || r["file"].trim() === "") {
      throw new Error("param 'file' must be a non-empty string");
    }
    if (typeof r["target"] !== "string" || r["target"].trim() === "") {
      throw new Error("param 'target' must be a non-empty string");
    }
    if (typeof r["field"] !== "string" || r["field"].trim() === "") {
      throw new Error("param 'field' must be a non-empty string");
    }
    return {
      file: r["file"] as string,
      target: r["target"] as string,
      field: r["field"] as string,
    };
  },
};

function preconditions(project: Project, p: RemoveSettingMethodParams): PreconditionResult {
  const errors: string[] = [];

  const sf = project.getSourceFile(p.file);
  if (!sf) {
    errors.push(`File not found in project: ${p.file}`);
    return { ok: false, errors };
  }

  const cls = sf
    .getDescendantsOfKind(SyntaxKind.ClassDeclaration)
    .find((c) => c.getName() === p.target);
  if (!cls) {
    errors.push(`Class '${p.target}' not found in file: ${p.file}`);
    return { ok: false, errors };
  }

  const setter = cls.getSetAccessor(p.field);
  if (!setter) {
    errors.push(`No setter for field '${p.field}' found in class '${p.target}'`);
  }

  return { ok: errors.length === 0, errors };
}

function apply(project: Project, p: RemoveSettingMethodParams): RefactoringResult {
  const sf = project.getSourceFile(p.file);
  if (!sf) {
    return { success: false, filesChanged: [], description: `File not found: ${p.file}` };
  }

  const cls = sf
    .getDescendantsOfKind(SyntaxKind.ClassDeclaration)
    .find((c) => c.getName() === p.target);
  if (!cls) {
    return {
      success: false,
      filesChanged: [],
      description: `Class '${p.target}' not found`,
    };
  }

  const setter = cls.getSetAccessor(p.field);
  if (!setter) {
    return {
      success: false,
      filesChanged: [],
      description: `No setter for field '${p.field}' found in class '${p.target}'`,
    };
  }

  // Make the corresponding property readonly if it exists
  const property = cls.getProperty(p.field);
  if (property) {
    property.setIsReadonly(true);
  }

  // Remove the setter
  setter.remove();

  return {
    success: true,
    filesChanged: [p.file],
    description: `Removed setter for '${p.field}' in class '${p.target}' and marked field as readonly`,
  };
}

export const removeSettingMethod: RefactoringDefinition = {
  name: "Remove Setting Method",
  kebabName: "remove-setting-method",
  description:
    "Removes a setter method from a class and marks the field as readonly, enforcing initialization only via constructor.",
  tier: 2,
  params,
  preconditions: (project: Project, raw: unknown): PreconditionResult =>
    preconditions(project, params.validate(raw) as RemoveSettingMethodParams),
  apply: (project: Project, raw: unknown): RefactoringResult =>
    apply(project, params.validate(raw) as RemoveSettingMethodParams),
};
