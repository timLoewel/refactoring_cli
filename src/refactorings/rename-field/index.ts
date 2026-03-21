import { SyntaxKind } from "ts-morph";
import type { Project, SourceFile } from "ts-morph";
import type {
  RefactoringDefinition,
  ParamSchema,
  PreconditionResult,
  RefactoringResult,
} from "../../engine/refactoring.types.js";

interface RenameFieldParams {
  file: string;
  target: string;
  field: string;
  name: string;
}

const params: ParamSchema = {
  definitions: [
    { name: "file", type: "string", description: "Path to the TypeScript file", required: true },
    {
      name: "target",
      type: "string",
      description: "Name of the class containing the field",
      required: true,
    },
    {
      name: "field",
      type: "string",
      description: "Current name of the field to rename",
      required: true,
    },
    { name: "name", type: "string", description: "New name for the field", required: true },
  ],
  validate(raw: unknown): RenameFieldParams {
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
    if (typeof r["name"] !== "string" || r["name"].trim() === "") {
      throw new Error("param 'name' must be a non-empty string");
    }
    return {
      file: r["file"] as string,
      target: r["target"] as string,
      field: r["field"] as string,
      name: r["name"] as string,
    };
  },
};

function preconditions(project: Project, p: RenameFieldParams): PreconditionResult {
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
    return { ok: false, errors };
  }

  const prop = targetClass.getProperty(p.field);
  if (!prop) {
    errors.push(`Field '${p.field}' not found on class '${p.target}'`);
  }

  if (p.field === p.name) {
    errors.push("'field' and 'name' must be different");
  }

  const existing = targetClass.getProperty(p.name);
  if (existing) {
    errors.push(`Field '${p.name}' already exists on class '${p.target}'`);
  }

  return { ok: errors.length === 0, errors };
}

function renamePropertyReferences(
  sf: SourceFile,
  className: string,
  oldName: string,
  newName: string,
): number {
  let renameCount = 0;
  const accessExpressions = sf.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression);
  for (const access of accessExpressions) {
    if (access.getName() === oldName) {
      const expressionType = access.getExpression().getType();
      const symbol = expressionType.getSymbol();
      if (symbol?.getName() === className) {
        access.getNameNode().replaceWithText(newName);
        renameCount++;
      }
    }
  }
  return renameCount;
}

function apply(project: Project, p: RenameFieldParams): RefactoringResult {
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

  const prop = targetClass.getProperty(p.field);
  if (!prop) {
    return {
      success: false,
      filesChanged: [],
      description: `Field '${p.field}' not found on class '${p.target}'`,
      diff: [],
    };
  }

  prop.rename(p.name);
  const referenceCount = renamePropertyReferences(sf, p.target, p.field, p.name);

  return {
    success: true,
    filesChanged: [p.file],
    description: `Renamed field '${p.field}' to '${p.name}' on class '${p.target}' (${referenceCount} external reference(s) updated)`,
    diff: [],
  };
}

export const renameField: RefactoringDefinition = {
  name: "Rename Field",
  kebabName: "rename-field",
  description: "Renames a field on a class and updates all references to it within the same file.",
  tier: 3,
  params,
  preconditions: (project: Project, raw: unknown): PreconditionResult =>
    preconditions(project, params.validate(raw) as RenameFieldParams),
  apply: (project: Project, raw: unknown): RefactoringResult =>
    apply(project, params.validate(raw) as RenameFieldParams),
};
