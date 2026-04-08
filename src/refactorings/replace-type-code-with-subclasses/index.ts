import { SyntaxKind } from "ts-morph";
import type { Project } from "ts-morph";
import type {
  EnumerateCandidate,
  PreconditionResult,
  RefactoringResult,
} from "../../core/refactoring.types.js";
import { defineRefactoring, param } from "../../core/refactoring-builder.js";
import { cleanupUnused } from "../../core/cleanup-unused.js";

function preconditions(project: Project, params: Record<string, unknown>): PreconditionResult {
  const file = params["file"] as string;
  const target = params["target"] as string;
  const typeField = params["typeField"] as string;
  const errors: string[] = [];

  const sf = project.getSourceFile(file);
  if (!sf) {
    return { ok: false, errors: [`File not found in project: ${file}`] };
  }

  const targetClass = sf.getClass(target);
  if (!targetClass) {
    return { ok: false, errors: [`Class '${target}' not found in file`] };
  }

  if (!targetClass.getProperty(typeField)) {
    errors.push(`Field '${typeField}' not found in class '${target}'`);
    return { ok: false, errors };
  }

  // Check if a parent class defines the same field as a property — converting to a
  // getter would violate TypeScript's property/accessor override rules.
  const baseClass = targetClass.getBaseClass();
  if (baseClass?.getProperty(typeField)) {
    errors.push(
      `Field '${typeField}' is also defined as a property in parent class '${baseClass.getName() ?? ""}' — converting to a getter would create a property/accessor conflict`,
    );
  }

  return { ok: errors.length === 0, errors };
}

function toValidClassName(str: string): string {
  // Remove non-alphanumeric characters and capitalize each word
  const cleaned = str.replace(/[^a-zA-Z0-9]+/g, " ").trim();
  return cleaned
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");
}

function buildSubclassText(
  subclassName: string,
  parentName: string,
  typeFieldName: string,
  typeValue: string,
): string {
  return `export class ${subclassName} extends ${parentName} {\n  get ${typeFieldName}(): string { return "${typeValue}"; }\n}\n`;
}

function apply(project: Project, params: Record<string, unknown>): RefactoringResult {
  const file = params["file"] as string;
  const target = params["target"] as string;
  const typeField = params["typeField"] as string;

  const sf = project.getSourceFile(file);
  if (!sf) {
    return { success: false, filesChanged: [], description: `File not found: ${file}` };
  }

  const targetClass = sf.getClass(target);
  if (!targetClass) {
    return { success: false, filesChanged: [], description: `Class '${target}' not found` };
  }

  const typeProperty = targetClass.getProperty(typeField);
  if (!typeProperty) {
    return {
      success: false,
      filesChanged: [],
      description: `Field '${typeField}' not found in '${target}'`,
    };
  }

  // Read the initializer to determine existing type values
  const initializer = typeProperty.getInitializer();
  const typeValue = initializer ? initializer.getText().replace(/['"]/g, "") : "default";

  // Make the type field abstract/overrideable by converting it to a getter
  typeProperty.remove();

  const refreshedClass = sf.getClass(target);
  if (refreshedClass) {
    refreshedClass.addGetAccessor({
      name: typeField,
      returnType: "string",
      statements: [`return "${typeValue}";`],
    });
  }

  // Generate a concrete subclass for the known type value
  const subclassName = toValidClassName(typeValue) + target;
  const subclassText = buildSubclassText(subclassName, target, typeField, typeValue);
  sf.addStatements(`\n${subclassText}`);

  cleanupUnused(sf);

  return {
    success: true,
    filesChanged: [file],
    description: `Replaced type code field '${typeField}' in '${target}' with subclass hierarchy; created '${subclassName}'`,
  };
}

export const replaceTypeCodeWithSubclasses = defineRefactoring({
  name: "Replace Type Code with Subclasses",
  kebabName: "replace-type-code-with-subclasses",
  description:
    "Replaces a type code field in a class with a proper subclass hierarchy, making the type distinction explicit in the class structure.",
  tier: 4,
  params: [
    param.file(),
    param.string("target", "Name of the class containing the type code field"),
    param.string("typeField", "Name of the type code field to replace with subclasses"),
  ],
  preconditions,
  apply,
  enumerate(project: Project): EnumerateCandidate[] {
    const candidates: EnumerateCandidate[] = [];
    for (const sf of project.getSourceFiles()) {
      const file = sf.getFilePath();
      for (const cls of sf.getClasses()) {
        const name = cls.getName();
        if (!name) continue;
        // Only include classes with string-initialized properties (type code candidates)
        for (const prop of cls.getProperties()) {
          const init = prop.getInitializer();
          if (!init) continue;
          if (
            init.getKind() === SyntaxKind.StringLiteral ||
            init.getKind() === SyntaxKind.NoSubstitutionTemplateLiteral
          ) {
            // Encode as "ClassName:fieldName" for buildApplyParams
            candidates.push({ file, target: `${name}:${prop.getName()}` });
            break; // one candidate per class is enough
          }
        }
      }
    }
    return candidates;
  },
});
