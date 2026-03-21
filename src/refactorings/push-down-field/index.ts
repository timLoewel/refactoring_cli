import type { Project } from "ts-morph";
import type {
  RefactoringDefinition,
  ParamSchema,
  PreconditionResult,
  RefactoringResult,
} from "../../engine/refactoring.types.js";

interface PushDownFieldParams {
  file: string;
  target: string;
  field: string;
  subclass: string;
}

const params: ParamSchema = {
  definitions: [
    { name: "file", type: "string", description: "Path to the TypeScript file", required: true },
    {
      name: "target",
      type: "string",
      description: "Name of the superclass containing the field",
      required: true,
    },
    {
      name: "field",
      type: "string",
      description: "Name of the field to push down",
      required: true,
    },
    {
      name: "subclass",
      type: "string",
      description: "Name of the subclass to receive the field",
      required: true,
    },
  ],
  validate(raw: unknown): PushDownFieldParams {
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
    if (typeof r["subclass"] !== "string" || r["subclass"].trim() === "") {
      throw new Error("param 'subclass' must be a non-empty string");
    }
    return {
      file: r["file"] as string,
      target: r["target"] as string,
      field: r["field"] as string,
      subclass: r["subclass"] as string,
    };
  },
};

function preconditions(project: Project, p: PushDownFieldParams): PreconditionResult {
  const errors: string[] = [];

  const sf = project.getSourceFile(p.file);
  if (!sf) {
    errors.push(`File not found in project: ${p.file}`);
    return { ok: false, errors };
  }

  const superClass = sf.getClass(p.target);
  if (!superClass) {
    errors.push(`Class '${p.target}' not found in file`);
    return { ok: false, errors };
  }

  if (!superClass.getProperty(p.field)) {
    errors.push(`Field '${p.field}' not found in class '${p.target}'`);
  }

  const subClass = sf.getClass(p.subclass);
  if (!subClass) {
    errors.push(`Subclass '${p.subclass}' not found in file`);
  } else {
    const extendsClause = subClass.getExtends();
    if (!extendsClause || extendsClause.getExpression().getText() !== p.target) {
      errors.push(`Class '${p.subclass}' does not extend '${p.target}'`);
    }
    if (subClass.getProperty(p.field)) {
      errors.push(`Field '${p.field}' already exists in subclass '${p.subclass}'`);
    }
  }

  return { ok: errors.length === 0, errors };
}

function apply(project: Project, p: PushDownFieldParams): RefactoringResult {
  const sf = project.getSourceFile(p.file);
  if (!sf) {
    return { success: false, filesChanged: [], description: `File not found: ${p.file}`, diff: [] };
  }

  const superClass = sf.getClass(p.target);
  if (!superClass) {
    return {
      success: false,
      filesChanged: [],
      description: `Class '${p.target}' not found`,
      diff: [],
    };
  }

  const property = superClass.getProperty(p.field);
  if (!property) {
    return {
      success: false,
      filesChanged: [],
      description: `Field '${p.field}' not found`,
      diff: [],
    };
  }

  const propertyText = property.getText();

  const subClass = sf.getClass(p.subclass);
  if (!subClass) {
    return {
      success: false,
      filesChanged: [],
      description: `Subclass '${p.subclass}' not found`,
      diff: [],
    };
  }

  property.remove();
  subClass.addMember(propertyText);

  return {
    success: true,
    filesChanged: [p.file],
    description: `Pushed field '${p.field}' down from '${p.target}' to '${p.subclass}'`,
    diff: [],
  };
}

export const pushDownField: RefactoringDefinition = {
  name: "Push Down Field",
  kebabName: "push-down-field",
  description:
    "Moves a field from a superclass down to a specific subclass that is the sole user of that field.",
  tier: 4,
  params,
  preconditions: (project: Project, raw: unknown): PreconditionResult =>
    preconditions(project, params.validate(raw) as PushDownFieldParams),
  apply: (project: Project, raw: unknown): RefactoringResult =>
    apply(project, params.validate(raw) as PushDownFieldParams),
};
