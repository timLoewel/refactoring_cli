import type { Project } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../engine/refactoring.types.js";
import { defineRefactoring, fileParam, stringParam } from "../../engine/refactoring-builder.js";

function preconditions(project: Project, params: Record<string, unknown>): PreconditionResult {
  const file = params["file"] as string;
  const target = params["target"] as string;
  const delegateFieldName = params["delegateFieldName"] as string;
  const errors: string[] = [];

  const sf = project.getSourceFile(file);
  if (!sf) {
    return { ok: false, errors: [`File not found in project: ${file}`] };
  }

  const targetClass = sf.getClass(target);
  if (!targetClass) {
    return { ok: false, errors: [`Class '${target}' not found in file`] };
  }

  const extendsClause = targetClass.getExtends();
  if (!extendsClause) {
    return { ok: false, errors: [`Class '${target}' does not extend any class`] };
  }

  if (targetClass.getProperty(delegateFieldName)) {
    errors.push(`Field '${delegateFieldName}' already exists in class '${target}'`);
  }

  return { ok: errors.length === 0, errors };
}

function buildForwardingMethods(superclassMethods: string[], delegateFieldName: string): string[] {
  return superclassMethods.map(
    (methodName) =>
      `  ${methodName}(): unknown { return this.${delegateFieldName}.${methodName}(); }`,
  );
}

function apply(project: Project, params: Record<string, unknown>): RefactoringResult {
  const file = params["file"] as string;
  const target = params["target"] as string;
  const delegateFieldName = params["delegateFieldName"] as string;

  const sf = project.getSourceFile(file);
  if (!sf) {
    return { success: false, filesChanged: [], description: `File not found: ${file}` };
  }

  const targetClass = sf.getClass(target);
  if (!targetClass) {
    return { success: false, filesChanged: [], description: `Class '${target}' not found` };
  }

  const extendsClause = targetClass.getExtends();
  if (!extendsClause) {
    return { success: false, filesChanged: [], description: `Class '${target}' has no superclass` };
  }

  const parentName = extendsClause.getExpression().getText();
  const parentClass = sf.getClass(parentName);

  // Collect superclass method names for forwarding
  const superclassMethodNames = parentClass ? parentClass.getMethods().map((m) => m.getName()) : [];

  // Remove the extends clause via the class API
  targetClass.removeExtends();

  // Add a delegate field pointing to an instance of the former superclass
  const refreshedClass = sf.getClass(target);
  if (!refreshedClass) {
    return {
      success: false,
      filesChanged: [],
      description: `Class '${target}' disappeared after transformation`,
    };
  }

  refreshedClass.addMember(`private ${delegateFieldName}: ${parentName} = new ${parentName}();`);

  // Add forwarding methods for each inherited method
  const forwardingMethods = buildForwardingMethods(superclassMethodNames, delegateFieldName);
  for (const methodText of forwardingMethods) {
    refreshedClass.addMember(methodText);
  }

  return {
    success: true,
    filesChanged: [file],
    description: `Replaced superclass '${parentName}' in '${target}' with delegate field '${delegateFieldName}'`,
  };
}

export const replaceSuperclassWithDelegate = defineRefactoring({
  name: "Replace Superclass with Delegate",
  kebabName: "replace-superclass-with-delegate",
  description:
    "Replaces a class's superclass inheritance with a delegate field, forwarding calls through composition instead of inheritance.",
  tier: 4,
  params: [
    fileParam(),
    stringParam("target", "Name of the class that currently inherits from a superclass"),
    stringParam("delegateFieldName", "Name for the new delegate field that will replace the superclass"),
  ],
  preconditions,
  apply,
});
