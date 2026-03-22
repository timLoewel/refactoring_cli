import type { Project } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../engine/refactoring.types.js";
import { defineRefactoring, param } from "../../engine/refactoring-builder.js";

function preconditions(project: Project, params: Record<string, unknown>): PreconditionResult {
  const file = params["file"] as string;
  const target = params["target"] as string;
  const field = params["field"] as string;
  const errors: string[] = [];

  const sf = project.getSourceFile(file);
  if (!sf) {
    return { ok: false, errors: [`File not found in project: ${file}`] };
  }

  const subclass = sf.getClass(target);
  if (!subclass) {
    return { ok: false, errors: [`Class '${target}' not found in file`] };
  }

  if (!subclass.getProperty(field)) {
    errors.push(`Field '${field}' not found in class '${target}'`);
  }

  const extendsClause = subclass.getExtends();
  if (!extendsClause) {
    errors.push(`Class '${target}' does not extend any class`);
  } else {
    const parentName = extendsClause.getExpression().getText();
    const parentClass = sf.getClass(parentName);
    if (!parentClass) {
      errors.push(`Parent class '${parentName}' not found in file`);
    } else if (parentClass.getProperty(field)) {
      errors.push(`Field '${field}' already exists in parent class '${parentName}'`);
    }
  }

  return { ok: errors.length === 0, errors };
}

function apply(project: Project, params: Record<string, unknown>): RefactoringResult {
  const file = params["file"] as string;
  const target = params["target"] as string;
  const field = params["field"] as string;

  const sf = project.getSourceFile(file);
  if (!sf) {
    return { success: false, filesChanged: [], description: `File not found: ${file}` };
  }

  const subclass = sf.getClass(target);
  if (!subclass) {
    return { success: false, filesChanged: [], description: `Class '${target}' not found` };
  }

  const property = subclass.getProperty(field);
  if (!property) {
    return { success: false, filesChanged: [], description: `Field '${field}' not found` };
  }

  const propertyText = property.getText();

  const extendsClause = subclass.getExtends();
  if (!extendsClause) {
    return {
      success: false,
      filesChanged: [],
      description: `Class '${target}' has no superclass`,
    };
  }

  const parentName = extendsClause.getExpression().getText();
  const parentClass = sf.getClass(parentName);
  if (!parentClass) {
    return {
      success: false,
      filesChanged: [],
      description: `Parent class '${parentName}' not found`,
    };
  }

  property.remove();
  parentClass.addMember(propertyText);

  return {
    success: true,
    filesChanged: [file],
    description: `Pulled field '${field}' up from '${target}' to '${parentName}'`,
  };
}

export const pullUpField = defineRefactoring({
  name: "Pull Up Field",
  kebabName: "pull-up-field",
  description: "Moves a field from a subclass to its superclass so all subclasses can share it.",
  tier: 4,
  params: [
    param.file(),
    param.string("target", "Name of the subclass containing the field"),
    param.string("field", "Name of the field to move to the superclass"),
  ],
  preconditions,
  apply,
});
