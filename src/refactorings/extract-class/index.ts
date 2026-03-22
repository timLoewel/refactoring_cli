import { SyntaxKind } from "ts-morph";
import type { Project } from "ts-morph";
import type {
  RefactoringDefinition,
  ParamSchema,
  PreconditionResult,
  RefactoringResult,
} from "../../engine/refactoring.types.js";

interface ExtractClassParams {
  file: string;
  target: string;
  fields: string;
  newClassName: string;
}

const params: ParamSchema = {
  definitions: [
    { name: "file", type: "string", description: "Path to the TypeScript file", required: true },
    { name: "target", type: "string", description: "Name of the source class", required: true },
    {
      name: "fields",
      type: "string",
      description: "Comma-separated field names to extract",
      required: true,
    },
    {
      name: "newClassName",
      type: "string",
      description: "Name for the new extracted class",
      required: true,
    },
  ],
  validate(raw: unknown): ExtractClassParams {
    const r = raw as Record<string, unknown>;
    if (typeof r["file"] !== "string" || r["file"].trim() === "") {
      throw new Error("param 'file' must be a non-empty string");
    }
    if (typeof r["target"] !== "string" || r["target"].trim() === "") {
      throw new Error("param 'target' must be a non-empty string");
    }
    if (typeof r["fields"] !== "string" || r["fields"].trim() === "") {
      throw new Error("param 'fields' must be a non-empty string");
    }
    if (typeof r["newClassName"] !== "string" || r["newClassName"].trim() === "") {
      throw new Error("param 'newClassName' must be a non-empty string");
    }
    return {
      file: r["file"] as string,
      target: r["target"] as string,
      fields: r["fields"] as string,
      newClassName: r["newClassName"] as string,
    };
  },
};

function preconditions(project: Project, p: ExtractClassParams): PreconditionResult {
  const errors: string[] = [];

  const sf = project.getSourceFile(p.file);
  if (!sf) {
    errors.push(`File not found in project: ${p.file}`);
    return { ok: false, errors };
  }

  const sourceClass = sf
    .getDescendantsOfKind(SyntaxKind.ClassDeclaration)
    .find((c) => c.getName() === p.target);
  if (!sourceClass) {
    errors.push(`Class '${p.target}' not found in file: ${p.file}`);
    return { ok: false, errors };
  }

  const fieldNames = p.fields
    .split(",")
    .map((f) => f.trim())
    .filter((f) => f.length > 0);
  for (const fieldName of fieldNames) {
    const found = sourceClass.getProperty(fieldName);
    if (!found) {
      errors.push(`Field '${fieldName}' not found on class '${p.target}'`);
    }
  }

  const existing = sf
    .getDescendantsOfKind(SyntaxKind.ClassDeclaration)
    .find((c) => c.getName() === p.newClassName);
  if (existing) {
    errors.push(`Class '${p.newClassName}' already exists in file`);
  }

  return { ok: errors.length === 0, errors };
}

function buildNewClassText(fieldDeclarations: string[], newClassName: string): string {
  const fieldsText = fieldDeclarations.join("\n  ");
  return `\nclass ${newClassName} {\n  ${fieldsText}\n}\n`;
}

function apply(project: Project, p: ExtractClassParams): RefactoringResult {
  const sf = project.getSourceFile(p.file);
  if (!sf) {
    return { success: false, filesChanged: [], description: `File not found: ${p.file}` };
  }

  const sourceClass = sf
    .getDescendantsOfKind(SyntaxKind.ClassDeclaration)
    .find((c) => c.getName() === p.target);
  if (!sourceClass) {
    return {
      success: false,
      filesChanged: [],
      description: `Class '${p.target}' not found`,
    };
  }

  const fieldNames = p.fields
    .split(",")
    .map((f) => f.trim())
    .filter((f) => f.length > 0);
  const fieldDeclarations: string[] = [];

  for (const fieldName of fieldNames) {
    const prop = sourceClass.getProperty(fieldName);
    if (prop) {
      fieldDeclarations.push(prop.getText());
      prop.remove();
    }
  }

  // Add a field referencing the new class on the source class
  const delegateFieldName = p.newClassName.charAt(0).toLowerCase() + p.newClassName.slice(1);
  sourceClass.addProperty({
    name: delegateFieldName,
    type: p.newClassName,
    initializer: `new ${p.newClassName}()`,
  });

  // Append the new class to the file
  sf.addStatements(buildNewClassText(fieldDeclarations, p.newClassName));

  return {
    success: true,
    filesChanged: [p.file],
    description: `Extracted fields [${fieldNames.join(", ")}] from '${p.target}' into new class '${p.newClassName}'`,
  };
}

export const extractClass: RefactoringDefinition = {
  name: "Extract Class",
  kebabName: "extract-class",
  description:
    "Extracts a set of fields from a class into a new class and adds a delegate field to the original.",
  tier: 3,
  params,
  preconditions: (project: Project, raw: unknown): PreconditionResult =>
    preconditions(project, params.validate(raw) as ExtractClassParams),
  apply: (project: Project, raw: unknown): RefactoringResult =>
    apply(project, params.validate(raw) as ExtractClassParams),
};
