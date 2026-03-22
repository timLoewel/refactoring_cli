import type { Project } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { defineRefactoring, param } from "../../core/refactoring-builder.js";

function buildSuperclassText(superclassName: string, methodTexts: string[]): string {
  const body = methodTexts.map((m) => `  ${m}`).join("\n\n");
  return `class ${superclassName} {\n${body}\n}\n`;
}

function preconditions(project: Project, params: Record<string, unknown>): PreconditionResult {
  const file = params["file"] as string;
  const target = params["target"] as string;
  const methods = params["methods"] as string;
  const superclassName = params["superclassName"] as string;
  const errors: string[] = [];

  const sf = project.getSourceFile(file);
  if (!sf) {
    return { ok: false, errors: [`File not found in project: ${file}`] };
  }

  const targetClass = sf.getClass(target);
  if (!targetClass) {
    return { ok: false, errors: [`Class '${target}' not found in file`] };
  }

  if (sf.getClass(superclassName)) {
    errors.push(`Class '${superclassName}' already exists in file`);
  }

  const methodNames = methods
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  for (const methodName of methodNames) {
    if (!targetClass.getMethod(methodName)) {
      errors.push(`Method '${methodName}' not found in class '${target}'`);
    }
  }

  return { ok: errors.length === 0, errors };
}

function apply(project: Project, params: Record<string, unknown>): RefactoringResult {
  const file = params["file"] as string;
  const target = params["target"] as string;
  const methods = params["methods"] as string;
  const superclassName = params["superclassName"] as string;

  const sf = project.getSourceFile(file);
  if (!sf) {
    return { success: false, filesChanged: [], description: `File not found: ${file}` };
  }

  const targetClass = sf.getClass(target);
  if (!targetClass) {
    return { success: false, filesChanged: [], description: `Class '${target}' not found` };
  }

  const methodNames = methods
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  const methodTexts: string[] = [];

  for (const methodName of methodNames) {
    const method = targetClass.getMethod(methodName);
    if (method) {
      methodTexts.push(method.getText());
      method.remove();
    }
  }

  const superclassText = buildSuperclassText(superclassName, methodTexts);
  sf.insertText(0, superclassText + "\n");

  const updatedClass = sf.getClass(target);
  if (updatedClass) {
    const existing = updatedClass.getExtends();
    if (!existing) {
      updatedClass.setExtends(superclassName);
    }
  }

  return {
    success: true,
    filesChanged: [file],
    description: `Extracted methods [${methodNames.join(", ")}] from '${target}' into new superclass '${superclassName}'`,
  };
}

export const extractSuperclass = defineRefactoring({
  name: "Extract Superclass",
  kebabName: "extract-superclass",
  description:
    "Extracts shared methods from a class into a new superclass, making the original class extend it.",
  tier: 4,
  params: [
    param.file(),
    param.string("target", "Name of the class to extract from"),
    param.string("methods", "Comma-separated method names to move to superclass"),
    param.string("superclassName", "Name for the new superclass"),
  ],
  preconditions,
  apply,
});
