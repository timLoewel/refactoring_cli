import type { Project } from "ts-morph";
import { Node } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../engine/refactoring.types.js";
import { defineRefactoring, param } from "../../engine/refactoring-builder.js";

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

  const constructor = subclass.getConstructors()[0];
  if (!constructor) {
    return { ok: false, errors: [`Class '${target}' has no constructor`] };
  }

  const extendsClause = subclass.getExtends();
  if (!extendsClause) {
    return { ok: false, errors: [`Class '${target}' does not extend any class`] };
  }

  const parentName = extendsClause.getExpression().getText();
  const parentClass = sf.getClass(parentName);
  if (!parentClass) {
    errors.push(`Parent class '${parentName}' not found in file`);
  }

  return { ok: errors.length === 0, errors };
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

  const subConstructor = subclass.getConstructors()[0];
  if (!subConstructor) {
    return { success: false, filesChanged: [], description: `No constructor in '${target}'` };
  }

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

  const subParams = subConstructor
    .getParameters()
    .map((param) => param.getText())
    .join(", ");
  const subBody = subConstructor.getBody();
  const bodyStatements = subBody && Node.isBlock(subBody) ? subBody.getStatements() : [];
  const nonSuperStatements = bodyStatements
    .map((s) => s.getText())
    .filter((text: string) => !text.startsWith("super("));

  const existingParentConstructor = parentClass.getConstructors()[0];
  if (existingParentConstructor) {
    for (const statement of nonSuperStatements) {
      existingParentConstructor.addStatements(statement);
    }
  } else {
    parentClass.addConstructor({
      parameters: subParams ? [{ name: subParams }] : [],
      statements: nonSuperStatements,
    });
  }

  // Simplify subclass constructor to only retain the super() call
  const freshSubBody = subConstructor.getBody();
  if (freshSubBody && Node.isBlock(freshSubBody)) {
    const stmtsToRemove = freshSubBody
      .getStatements()
      .filter((s) => !s.getText().startsWith("super("));
    for (const stmt of [...stmtsToRemove].reverse()) {
      stmt.remove();
    }
  }

  return {
    success: true,
    filesChanged: [file],
    description: `Pulled constructor body of '${target}' up to '${parentName}'`,
  };
}

export const pullUpConstructorBody = defineRefactoring({
  name: "Pull Up Constructor Body",
  kebabName: "pull-up-constructor-body",
  description:
    "Moves common constructor initialization logic from a subclass up to the superclass constructor.",
  tier: 4,
  params: [
    param.file(),
    param.string("target", "Name of the subclass whose constructor body to pull up"),
  ],
  preconditions,
  apply,
});
