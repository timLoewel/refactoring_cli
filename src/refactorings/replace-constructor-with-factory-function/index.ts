import type { Project } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../engine/refactoring.types.js";
import { defineRefactoring, param } from "../../engine/refactoring-builder.js";

function preconditions(project: Project, params: Record<string, unknown>): PreconditionResult {
  const file = params["file"] as string;
  const target = params["target"] as string;
  const factoryName = params["factoryName"] as string;
  const errors: string[] = [];

  const sf = project.getSourceFile(file);
  if (!sf) {
    return { ok: false, errors: [`File not found in project: ${file}`] };
  }

  const targetClass = sf.getClass(target);
  if (!targetClass) {
    return { ok: false, errors: [`Class '${target}' not found in file`] };
  }

  if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(factoryName)) {
    errors.push(`'${factoryName}' is not a valid identifier`);
  }

  const existingFactory = sf.getFunction(factoryName);
  if (existingFactory) {
    errors.push(`Function '${factoryName}' already exists in file`);
  }

  return { ok: errors.length === 0, errors };
}

function buildFactorySignature(
  className: string,
  factoryName: string,
  constructorParams: string,
): string {
  return `function ${factoryName}(${constructorParams}): ${className} {\n  return new ${className}(${constructorParams
    .split(",")
    .map((p) => p.trim().split(":")[0]?.trim() ?? "")
    .join(", ")});\n}`;
}

function replaceNewExpressions(
  project: Project,
  file: string,
  className: string,
  factoryName: string,
): void {
  const sf = project.getSourceFile(file);
  if (!sf) return;

  const newExpressions = sf
    .getDescendantsOfKind(SyntaxKind.NewExpression)
    .filter((expr) => expr.getExpression().getText() === className);

  for (const expr of [...newExpressions].reverse()) {
    const args = expr
      .getArguments()
      .map((a) => a.getText())
      .join(", ");
    expr.replaceWithText(`${factoryName}(${args})`);
  }
}

function apply(project: Project, params: Record<string, unknown>): RefactoringResult {
  const file = params["file"] as string;
  const target = params["target"] as string;
  const factoryName = params["factoryName"] as string;

  const sf = project.getSourceFile(file);
  if (!sf) {
    return { success: false, filesChanged: [], description: `File not found: ${file}` };
  }

  const targetClass = sf.getClass(target);
  if (!targetClass) {
    return { success: false, filesChanged: [], description: `Class '${target}' not found` };
  }

  const constructor = targetClass.getConstructors()[0];
  const constructorParams = constructor
    ? constructor
        .getParameters()
        .map((param) => param.getText())
        .join(", ")
    : "";

  const factoryText = buildFactorySignature(target, factoryName, constructorParams);

  // Replace new ClassName(...) calls with factoryName(...) throughout the file
  replaceNewExpressions(project, file, target, factoryName);

  // Add factory function after the class
  const refreshedFile = project.getSourceFile(file);
  if (refreshedFile) {
    refreshedFile.addStatements(`\n${factoryText}\n`);
  }

  return {
    success: true,
    filesChanged: [file],
    description: `Replaced constructor of '${target}' with factory function '${factoryName}'`,
  };
}

export const replaceConstructorWithFactoryFunction = defineRefactoring({
  name: "Replace Constructor with Factory Function",
  kebabName: "replace-constructor-with-factory-function",
  description:
    "Introduces a named factory function for a class, replacing direct constructor calls with the factory.",
  tier: 4,
  params: [
    param.file(),
    param.string("target", "Name of the class whose constructor to replace with a factory"),
    param.identifier("factoryName", "Name for the new factory function"),
  ],
  preconditions,
  apply,
});
