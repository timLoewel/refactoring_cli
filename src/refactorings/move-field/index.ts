import { SyntaxKind } from "ts-morph";
import type { Project } from "ts-morph";
import type {
  RefactoringDefinition,
  ParamSchema,
  PreconditionResult,
  RefactoringResult,
} from "../../engine/refactoring.types.js";

interface MoveFieldParams {
  file: string;
  target: string;
  field: string;
  destination: string;
}

const params: ParamSchema = {
  definitions: [
    { name: "file", type: "string", description: "Path to the TypeScript file", required: true },
    { name: "target", type: "string", description: "Name of the source class", required: true },
    { name: "field", type: "string", description: "Name of the field to move", required: true },
    {
      name: "destination",
      type: "string",
      description: "Name of the destination class",
      required: true,
    },
  ],
  validate(raw: unknown): MoveFieldParams {
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
    if (typeof r["destination"] !== "string" || r["destination"].trim() === "") {
      throw new Error("param 'destination' must be a non-empty string");
    }
    return {
      file: r["file"] as string,
      target: r["target"] as string,
      field: r["field"] as string,
      destination: r["destination"] as string,
    };
  },
};

function preconditions(project: Project, p: MoveFieldParams): PreconditionResult {
  const errors: string[] = [];

  const sf = project.getSourceFile(p.file);
  if (!sf) {
    errors.push(`File not found in project: ${p.file}`);
    return { ok: false, errors };
  }

  const classes = sf.getDescendantsOfKind(SyntaxKind.ClassDeclaration);

  const sourceClass = classes.find((c) => c.getName() === p.target);
  if (!sourceClass) {
    errors.push(`Class '${p.target}' not found in file: ${p.file}`);
    return { ok: false, errors };
  }

  const prop = sourceClass.getProperty(p.field);
  if (!prop) {
    errors.push(`Field '${p.field}' not found on class '${p.target}'`);
  }

  const destClass = classes.find((c) => c.getName() === p.destination);
  if (!destClass) {
    errors.push(`Destination class '${p.destination}' not found in file: ${p.file}`);
    return { ok: false, errors };
  }

  const existingProp = destClass.getProperty(p.field);
  if (existingProp) {
    errors.push(`Field '${p.field}' already exists on class '${p.destination}'`);
  }

  if (p.target === p.destination) {
    errors.push("'target' and 'destination' must be different classes");
  }

  return { ok: errors.length === 0, errors };
}

function apply(project: Project, p: MoveFieldParams): RefactoringResult {
  const sf = project.getSourceFile(p.file);
  if (!sf) {
    return { success: false, filesChanged: [], description: `File not found: ${p.file}` };
  }

  const classes = sf.getDescendantsOfKind(SyntaxKind.ClassDeclaration);
  const sourceClass = classes.find((c) => c.getName() === p.target);
  const destClass = classes.find((c) => c.getName() === p.destination);

  if (!sourceClass || !destClass) {
    return {
      success: false,
      filesChanged: [],
      description: "Source or destination class not found",
    };
  }

  const prop = sourceClass.getProperty(p.field);
  if (!prop) {
    return {
      success: false,
      filesChanged: [],
      description: `Field '${p.field}' not found on class '${p.target}'`,
    };
  }

  const propText = prop.getText();
  prop.remove();
  destClass.addMember(propText);

  return {
    success: true,
    filesChanged: [p.file],
    description: `Moved field '${p.field}' from class '${p.target}' to class '${p.destination}'`,
  };
}

export const moveField: RefactoringDefinition = {
  name: "Move Field",
  kebabName: "move-field",
  description: "Moves a field declaration from one class to another class within the same file.",
  tier: 3,
  params,
  preconditions: (project: Project, raw: unknown): PreconditionResult =>
    preconditions(project, params.validate(raw) as MoveFieldParams),
  apply: (project: Project, raw: unknown): RefactoringResult =>
    apply(project, params.validate(raw) as MoveFieldParams),
};
