import type { Project } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { defineRefactoring, param } from "../../core/refactoring-builder.js";

function preconditions(project: Project, params: Record<string, unknown>): PreconditionResult {
  const file = params["file"] as string;
  const target = params["target"] as string;
  const method = params["method"] as string;
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

  if (!superClass.getMethod(method)) {
    errors.push(`Method '${method}' not found in class '${target}'`);
  }

  const subClass = sf.getClass(subclass);
  if (!subClass) {
    errors.push(`Subclass '${subclass}' not found in file`);
  } else {
    const extendsClause = subClass.getExtends();
    if (!extendsClause || extendsClause.getExpression().getText() !== target) {
      errors.push(`Class '${subclass}' does not extend '${target}'`);
    }
    if (subClass.getMethod(method)) {
      errors.push(`Method '${method}' already exists in subclass '${subclass}'`);
    }
  }

  return { ok: errors.length === 0, errors };
}

function apply(project: Project, params: Record<string, unknown>): RefactoringResult {
  const file = params["file"] as string;
  const target = params["target"] as string;
  const method = params["method"] as string;
  const subclass = params["subclass"] as string;

  const sf = project.getSourceFile(file);
  if (!sf) {
    return { success: false, filesChanged: [], description: `File not found: ${file}` };
  }

  const superClass = sf.getClass(target);
  if (!superClass) {
    return { success: false, filesChanged: [], description: `Class '${target}' not found` };
  }

  const methodDecl = superClass.getMethod(method);
  if (!methodDecl) {
    return { success: false, filesChanged: [], description: `Method '${method}' not found` };
  }

  const methodText = methodDecl.getText();

  const subClass = sf.getClass(subclass);
  if (!subClass) {
    return { success: false, filesChanged: [], description: `Subclass '${subclass}' not found` };
  }

  methodDecl.remove();
  subClass.addMember(methodText);

  return {
    success: true,
    filesChanged: [file],
    description: `Pushed method '${method}' down from '${target}' to '${subclass}'`,
  };
}

export const pushDownMethod = defineRefactoring({
  name: "Push Down Method",
  kebabName: "push-down-method",
  description:
    "Moves a method from a superclass down to a specific subclass that is the only relevant consumer.",
  tier: 4,
  params: [
    param.file(),
    param.string("target", "Name of the superclass containing the method"),
    param.string("method", "Name of the method to push down"),
    param.string("subclass", "Name of the subclass to receive the method"),
  ],
  preconditions,
  apply,
});
