import type { Project } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../engine/refactoring.types.js";
import { defineRefactoring, param } from "../../engine/refactoring-builder.js";

function resolveParentClass(
  project: Project,
  file: string,
  subclassName: string,
): { parentName: string; error?: string } {
  const sf = project.getSourceFile(file);
  if (!sf) return { parentName: "", error: `File not found: ${file}` };
  const subclass = sf.getClass(subclassName);
  if (!subclass) return { parentName: "", error: `Class '${subclassName}' not found` };
  const extendsClause = subclass.getExtends();
  if (!extendsClause) return { parentName: "", error: `Class '${subclassName}' has no superclass` };
  return { parentName: extendsClause.getExpression().getText() };
}

function preconditions(project: Project, params: Record<string, unknown>): PreconditionResult {
  const file = params["file"] as string;
  const target = params["target"] as string;
  const method = params["method"] as string;
  const errors: string[] = [];

  const sf = project.getSourceFile(file);
  if (!sf) {
    return { ok: false, errors: [`File not found in project: ${file}`] };
  }

  const subclass = sf.getClass(target);
  if (!subclass) {
    return { ok: false, errors: [`Class '${target}' not found in file`] };
  }

  if (!subclass.getMethod(method)) {
    errors.push(`Method '${method}' not found in class '${target}'`);
  }

  const { parentName, error } = resolveParentClass(project, file, target);
  if (error) {
    errors.push(error);
  } else {
    const parentClass = sf.getClass(parentName);
    if (!parentClass) {
      errors.push(`Parent class '${parentName}' not found in file`);
    } else if (parentClass.getMethod(method)) {
      errors.push(`Method '${method}' already exists in parent class '${parentName}'`);
    }
  }

  return { ok: errors.length === 0, errors };
}

function apply(project: Project, params: Record<string, unknown>): RefactoringResult {
  const file = params["file"] as string;
  const target = params["target"] as string;
  const method = params["method"] as string;

  const sf = project.getSourceFile(file);
  if (!sf) {
    return { success: false, filesChanged: [], description: `File not found: ${file}` };
  }

  const subclass = sf.getClass(target);
  if (!subclass) {
    return { success: false, filesChanged: [], description: `Class '${target}' not found` };
  }

  const methodDecl = subclass.getMethod(method);
  if (!methodDecl) {
    return { success: false, filesChanged: [], description: `Method '${method}' not found` };
  }

  const methodText = methodDecl.getText();

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

  methodDecl.remove();
  parentClass.addMember(methodText);

  return {
    success: true,
    filesChanged: [file],
    description: `Pulled method '${method}' up from '${target}' to '${parentName}'`,
  };
}

export const pullUpMethod = defineRefactoring({
  name: "Pull Up Method",
  kebabName: "pull-up-method",
  description:
    "Moves a method from a subclass to its superclass, making it available to all siblings.",
  tier: 4,
  params: [
    param.file(),
    param.string("target", "Name of the subclass containing the method"),
    param.string("method", "Name of the method to move to the superclass"),
  ],
  preconditions,
  apply,
});
