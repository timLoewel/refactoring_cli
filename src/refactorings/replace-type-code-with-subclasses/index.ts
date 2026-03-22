import type { Project } from "ts-morph";
import type {
  RefactoringDefinition,
  ParamSchema,
  PreconditionResult,
  RefactoringResult,
} from "../../engine/refactoring.types.js";

interface ReplaceTypeCodeWithSubclassesParams {
  file: string;
  target: string;
  typeField: string;
}

const params: ParamSchema = {
  definitions: [
    { name: "file", type: "string", description: "Path to the TypeScript file", required: true },
    {
      name: "target",
      type: "string",
      description: "Name of the class containing the type code field",
      required: true,
    },
    {
      name: "typeField",
      type: "string",
      description: "Name of the type code field to replace with subclasses",
      required: true,
    },
  ],
  validate(raw: unknown): ReplaceTypeCodeWithSubclassesParams {
    const r = raw as Record<string, unknown>;
    if (typeof r["file"] !== "string" || r["file"].trim() === "") {
      throw new Error("param 'file' must be a non-empty string");
    }
    if (typeof r["target"] !== "string" || r["target"].trim() === "") {
      throw new Error("param 'target' must be a non-empty string");
    }
    if (typeof r["typeField"] !== "string" || r["typeField"].trim() === "") {
      throw new Error("param 'typeField' must be a non-empty string");
    }
    return {
      file: r["file"] as string,
      target: r["target"] as string,
      typeField: r["typeField"] as string,
    };
  },
};

function preconditions(
  project: Project,
  p: ReplaceTypeCodeWithSubclassesParams,
): PreconditionResult {
  const errors: string[] = [];

  const sf = project.getSourceFile(p.file);
  if (!sf) {
    errors.push(`File not found in project: ${p.file}`);
    return { ok: false, errors };
  }

  const targetClass = sf.getClass(p.target);
  if (!targetClass) {
    errors.push(`Class '${p.target}' not found in file`);
    return { ok: false, errors };
  }

  if (!targetClass.getProperty(p.typeField)) {
    errors.push(`Field '${p.typeField}' not found in class '${p.target}'`);
  }

  return { ok: errors.length === 0, errors };
}

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function buildSubclassText(
  subclassName: string,
  parentName: string,
  typeFieldName: string,
  typeValue: string,
): string {
  return `class ${subclassName} extends ${parentName} {\n  get ${typeFieldName}(): string { return "${typeValue}"; }\n}\n`;
}

function apply(project: Project, p: ReplaceTypeCodeWithSubclassesParams): RefactoringResult {
  const sf = project.getSourceFile(p.file);
  if (!sf) {
    return { success: false, filesChanged: [], description: `File not found: ${p.file}` };
  }

  const targetClass = sf.getClass(p.target);
  if (!targetClass) {
    return {
      success: false,
      filesChanged: [],
      description: `Class '${p.target}' not found`,
    };
  }

  const typeProperty = targetClass.getProperty(p.typeField);
  if (!typeProperty) {
    return {
      success: false,
      filesChanged: [],
      description: `Field '${p.typeField}' not found in '${p.target}'`,
    };
  }

  // Read the initializer to determine existing type values
  const initializer = typeProperty.getInitializer();
  const typeValue = initializer ? initializer.getText().replace(/['"]/g, "") : "default";

  // Make the type field abstract/overrideable by converting it to a getter
  typeProperty.remove();

  const refreshedClass = sf.getClass(p.target);
  if (refreshedClass) {
    refreshedClass.addGetAccessor({
      name: p.typeField,
      returnType: "string",
      statements: [`throw new Error("Subclass must override ${p.typeField}");`],
    });
  }

  // Generate a concrete subclass for the known type value
  const subclassName = capitalizeFirst(typeValue) + p.target;
  const subclassText = buildSubclassText(subclassName, p.target, p.typeField, typeValue);
  sf.addStatements(`\n${subclassText}`);

  return {
    success: true,
    filesChanged: [p.file],
    description: `Replaced type code field '${p.typeField}' in '${p.target}' with subclass hierarchy; created '${subclassName}'`,
  };
}

export const replaceTypeCodeWithSubclasses: RefactoringDefinition = {
  name: "Replace Type Code with Subclasses",
  kebabName: "replace-type-code-with-subclasses",
  description:
    "Replaces a type code field in a class with a proper subclass hierarchy, making the type distinction explicit in the class structure.",
  tier: 4,
  params,
  preconditions: (project: Project, raw: unknown): PreconditionResult =>
    preconditions(project, params.validate(raw) as ReplaceTypeCodeWithSubclassesParams),
  apply: (project: Project, raw: unknown): RefactoringResult =>
    apply(project, params.validate(raw) as ReplaceTypeCodeWithSubclassesParams),
};
