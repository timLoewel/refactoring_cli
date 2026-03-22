import type { Project } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { defineRefactoring, param } from "../../core/refactoring-builder.js";

function preconditions(project: Project, params: Record<string, unknown>): PreconditionResult {
  const file = params["file"] as string;
  const target = params["target"] as string;
  const field = params["field"] as string;
  const subclass = params["subclass"] as string;
  const errors: string[] = [];

  const sf = project.getSourceFile(file);
  if (!sf) {
    return { ok: false, errors: [`File not found in project: ${file}`] };
  }

  const superClass = sf.getClass(target);
  if (!superClass) {
    return { ok: false, errors: [`Class '${target}' not found in file`] };
  }

  if (!superClass.getProperty(field)) {
    errors.push(`Field '${field}' not found in class '${target}'`);
  }

  const subClass = sf.getClass(subclass);
  if (!subClass) {
    errors.push(`Subclass '${subclass}' not found in file`);
  } else {
    const extendsClause = subClass.getExtends();
    if (!extendsClause || extendsClause.getExpression().getText() !== target) {
      errors.push(`Class '${subclass}' does not extend '${target}'`);
    }
    if (subClass.getProperty(field)) {
      errors.push(`Field '${field}' already exists in subclass '${subclass}'`);
    }
  }

  return { ok: errors.length === 0, errors };
}

function apply(project: Project, params: Record<string, unknown>): RefactoringResult {
  const file = params["file"] as string;
  const target = params["target"] as string;
  const field = params["field"] as string;
  const subclass = params["subclass"] as string;

  const sf = project.getSourceFile(file);
  if (!sf) {
    return { success: false, filesChanged: [], description: `File not found: ${file}` };
  }

  const superClass = sf.getClass(target);
  if (!superClass) {
    return { success: false, filesChanged: [], description: `Class '${target}' not found` };
  }

  const property = superClass.getProperty(field);
  if (!property) {
    return { success: false, filesChanged: [], description: `Field '${field}' not found` };
  }

  const propertyText = property.getText();

  const subClass = sf.getClass(subclass);
  if (!subClass) {
    return { success: false, filesChanged: [], description: `Subclass '${subclass}' not found` };
  }

  property.remove();
  subClass.addMember(propertyText);

  return {
    success: true,
    filesChanged: [file],
    description: `Pushed field '${field}' down from '${target}' to '${subclass}'`,
  };
}

export const pushDownField = defineRefactoring({
  name: "Push Down Field",
  kebabName: "push-down-field",
  description:
    "Moves a field from a superclass down to a specific subclass that is the sole user of that field.",
  tier: 4,
  params: [
    param.file(),
    param.string("target", "Name of the superclass containing the field"),
    param.string("field", "Name of the field to push down"),
    param.string("subclass", "Name of the subclass to receive the field"),
  ],
  preconditions,
  apply,
});
