import type { Project } from "ts-morph";
import type {
  RefactoringDefinition,
  ParamSchema,
  PreconditionResult,
  RefactoringResult,
} from "../../engine/refactoring.types.js";

interface PullUpFieldParams {
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
      description: "Name of the subclass containing the field",
      required: true,
    },
    {
      name: "field",
      type: "string",
      description: "Name of the field to move to the superclass",
      required: true,
    },
  ],
  validate(raw: unknown): PullUpFieldParams {
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

function preconditions(project: Project, p: PullUpFieldParams): PreconditionResult {
  const errors: string[] = [];

  const sf = project.getSourceFile(p.file);
  if (!sf) {
    errors.push(`File not found in project: ${p.file}`);
    return { ok: false, errors };
  }

  const subclass = sf.getClass(p.target);
  if (!subclass) {
    errors.push(`Class '${p.target}' not found in file`);
    return { ok: false, errors };
  }

  if (!subclass.getProperty(p.field)) {
    errors.push(`Field '${p.field}' not found in class '${p.target}'`);
  }

  const extendsClause = subclass.getExtends();
  if (!extendsClause) {
    errors.push(`Class '${p.target}' does not extend any class`);
  } else {
    const parentName = extendsClause.getExpression().getText();
    const parentClass = sf.getClass(parentName);
    if (!parentClass) {
      errors.push(`Parent class '${parentName}' not found in file`);
    } else if (parentClass.getProperty(p.field)) {
      errors.push(`Field '${p.field}' already exists in parent class '${parentName}'`);
    }
  }

  return { ok: errors.length === 0, errors };
}

function apply(project: Project, p: PullUpFieldParams): RefactoringResult {
  const sf = project.getSourceFile(p.file);
  if (!sf) {
    return { success: false, filesChanged: [], description: `File not found: ${p.file}`, diff: [] };
  }

  const subclass = sf.getClass(p.target);
  if (!subclass) {
    return {
      success: false,
      filesChanged: [],
      description: `Class '${p.target}' not found`,
      diff: [],
    };
  }

  const property = subclass.getProperty(p.field);
  if (!property) {
    return {
      success: false,
      filesChanged: [],
      description: `Field '${p.field}' not found`,
      diff: [],
    };
  }

  const propertyText = property.getText();

  const extendsClause = subclass.getExtends();
  if (!extendsClause) {
    return {
      success: false,
      filesChanged: [],
      description: `Class '${p.target}' has no superclass`,
      diff: [],
    };
  }

  const parentName = extendsClause.getExpression().getText();
  const parentClass = sf.getClass(parentName);
  if (!parentClass) {
    return {
      success: false,
      filesChanged: [],
      description: `Parent class '${parentName}' not found`,
      diff: [],
    };
  }

  property.remove();
  parentClass.addMember(propertyText);

  return {
    success: true,
    filesChanged: [p.file],
    description: `Pulled field '${p.field}' up from '${p.target}' to '${parentName}'`,
    diff: [],
  };
}

export const pullUpField: RefactoringDefinition = {
  name: "Pull Up Field",
  kebabName: "pull-up-field",
  description: "Moves a field from a subclass to its superclass so all subclasses can share it.",
  tier: 4,
  params,
  preconditions: (project: Project, raw: unknown): PreconditionResult =>
    preconditions(project, params.validate(raw) as PullUpFieldParams),
  apply: (project: Project, raw: unknown): RefactoringResult =>
    apply(project, params.validate(raw) as PullUpFieldParams),
};
