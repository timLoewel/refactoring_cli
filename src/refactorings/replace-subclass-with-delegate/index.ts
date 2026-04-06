import type { Project } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { defineRefactoring, enumerate, param } from "../../core/refactoring-builder.js";
import { cleanupUnused } from "../../core/cleanup-unused.js";

function preconditions(project: Project, params: Record<string, unknown>): PreconditionResult {
  const file = params["file"] as string;
  const target = params["target"] as string;
  const delegateClassName = params["delegateClassName"] as string;
  const errors: string[] = [];

  const sf = project.getSourceFile(file);
  if (!sf) {
    return { ok: false, errors: [`File not found in project: ${file}`] };
  }

  const subclass = sf.getClass(target);
  if (!subclass) {
    return { ok: false, errors: [`Class '${target}' not found in file`] };
  }

  const extendsClause = subclass.getExtends();
  if (!extendsClause) {
    errors.push(`Class '${target}' does not extend any class`);
  }

  if (sf.getClass(delegateClassName)) {
    errors.push(`Class '${delegateClassName}' already exists in file`);
  }

  return { ok: errors.length === 0, errors };
}

function buildDelegateClass(delegateClassName: string, methodTexts: string[]): string {
  const body = methodTexts.length > 0 ? methodTexts.map((m) => `  ${m}`).join("\n\n") : "";
  return `class ${delegateClassName} {\n${body}\n}\n`;
}

function buildForwardingMethod(methodName: string, delegateField: string): string {
  return `  ${methodName}(): unknown { return this.${delegateField}.${methodName}(); }`;
}

function apply(project: Project, params: Record<string, unknown>): RefactoringResult {
  const file = params["file"] as string;
  const target = params["target"] as string;
  const delegateClassName = params["delegateClassName"] as string;

  const sf = project.getSourceFile(file);
  if (!sf) {
    return { success: false, filesChanged: [], description: `File not found: ${file}` };
  }

  const subclass = sf.getClass(target);
  if (!subclass) {
    return { success: false, filesChanged: [], description: `Class '${target}' not found` };
  }

  if (!subclass.getExtends()) {
    return { success: false, filesChanged: [], description: `Class '${target}' has no superclass` };
  }

  // Collect subclass-specific methods (those not from the parent)
  const subclassMethods = subclass.getMethods();
  const methodTexts = subclassMethods.map((m) => m.getText());
  const methodNames = subclassMethods.map((m) => m.getName());

  const delegateField = delegateClassName.charAt(0).toLowerCase() + delegateClassName.slice(1);

  // Build delegate class with the subclass-specific methods
  const delegateClassText = buildDelegateClass(delegateClassName, methodTexts);
  sf.insertText(0, delegateClassText + "\n");

  // Remove the extends clause from the target class
  const refreshedClass = sf.getClass(target);
  if (refreshedClass) {
    refreshedClass.removeExtends();

    for (const methodName of methodNames) {
      const method = refreshedClass.getMethod(methodName);
      if (method) {
        method.remove();
      }
    }

    // Add delegate field and forwarding methods
    refreshedClass.addMember(
      `private ${delegateField}: ${delegateClassName} = new ${delegateClassName}();`,
    );

    for (const methodName of methodNames) {
      refreshedClass.addMember(buildForwardingMethod(methodName, delegateField));
    }
  }

  cleanupUnused(sf);

  return {
    success: true,
    filesChanged: [file],
    description: `Replaced subclass '${target}' inheritance with delegation to new '${delegateClassName}'`,
  };
}

export const replaceSubclassWithDelegate = defineRefactoring({
  name: "Replace Subclass with Delegate",
  kebabName: "replace-subclass-with-delegate",
  description:
    "Replaces inheritance by creating a delegate class that holds the subclass behavior, turning the subclass into a standalone class.",
  tier: 4,
  params: [
    param.file(),
    param.string("target", "Name of the subclass to replace with delegation"),
    param.string("delegateClassName", "Name for the new delegate class"),
  ],
  preconditions,
  apply,
  enumerate: enumerate.classes,
});
