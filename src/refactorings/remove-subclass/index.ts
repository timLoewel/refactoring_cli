import type { Project } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { defineRefactoring, enumerate, param } from "../../core/refactoring-builder.js";

function preconditions(project: Project, params: Record<string, unknown>): PreconditionResult {
  const file = params["file"] as string;
  const target = params["target"] as string;
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
    return {
      ok: false,
      errors: [`Class '${target}' does not extend any class — it is not a subclass`],
    };
  }

  const parentName = extendsClause.getExpression().getText();
  const parentClass = sf.getClass(parentName);
  if (!parentClass) {
    errors.push(`Parent class '${parentName}' not found in file`);
  }

  return { ok: errors.length === 0, errors };
}

function buildTypeFieldName(subclassName: string): string {
  return subclassName.charAt(0).toLowerCase() + subclassName.slice(1) + "Type";
}

function apply(project: Project, params: Record<string, unknown>): RefactoringResult {
  const file = params["file"] as string;
  const target = params["target"] as string;

  const sf = project.getSourceFile(file);
  if (!sf) {
    return { success: false, filesChanged: [], description: `File not found: ${file}` };
  }

  const subclass = sf.getClass(target);
  if (!subclass) {
    return { success: false, filesChanged: [], description: `Class '${target}' not found` };
  }

  const extendsClause = subclass.getExtends();
  if (!extendsClause) {
    return { success: false, filesChanged: [], description: `Class '${target}' has no superclass` };
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

  const typeFieldName = buildTypeFieldName(target);
  const typeValue = target.toLowerCase();

  // Add a type discriminator field to the parent if not present
  if (!parentClass.getProperty(typeFieldName)) {
    parentClass.addMember(`${typeFieldName}: string = "${typeValue}";`);
  }

  // Move members from subclass to parent before removal
  const subMembers = subclass.getMembers();
  for (const member of subMembers) {
    parentClass.addMember(member.getText());
  }

  subclass.remove();

  return {
    success: true,
    filesChanged: [file],
    description: `Removed subclass '${target}', merged into '${parentName}' with type field '${typeFieldName}'`,
  };
}

export const removeSubclass = defineRefactoring({
  name: "Remove Subclass",
  kebabName: "remove-subclass",
  description:
    "Removes a subclass by merging it into its parent and replacing the subclass distinction with a type field.",
  tier: 4,
  params: [param.file(), param.string("target", "Name of the subclass to remove")],
  preconditions,
  apply,
  enumerate: enumerate.classes,
});
