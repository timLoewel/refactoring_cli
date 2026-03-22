import type { Project } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type {
  RefactoringDefinition,
  ParamSchema,
  PreconditionResult,
  RefactoringResult,
} from "../../engine/refactoring.types.js";

interface ReplaceConstructorWithFactoryFunctionParams {
  file: string;
  target: string;
  factoryName: string;
}

const params: ParamSchema = {
  definitions: [
    { name: "file", type: "string", description: "Path to the TypeScript file", required: true },
    {
      name: "target",
      type: "string",
      description: "Name of the class whose constructor to replace with a factory",
      required: true,
    },
    {
      name: "factoryName",
      type: "string",
      description: "Name for the new factory function",
      required: true,
    },
  ],
  validate(raw: unknown): ReplaceConstructorWithFactoryFunctionParams {
    const r = raw as Record<string, unknown>;
    if (typeof r["file"] !== "string" || r["file"].trim() === "") {
      throw new Error("param 'file' must be a non-empty string");
    }
    if (typeof r["target"] !== "string" || r["target"].trim() === "") {
      throw new Error("param 'target' must be a non-empty string");
    }
    if (typeof r["factoryName"] !== "string" || r["factoryName"].trim() === "") {
      throw new Error("param 'factoryName' must be a non-empty string");
    }
    return {
      file: r["file"] as string,
      target: r["target"] as string,
      factoryName: r["factoryName"] as string,
    };
  },
};

function preconditions(
  project: Project,
  p: ReplaceConstructorWithFactoryFunctionParams,
): PreconditionResult {
  const errors: string[] = [];

  const sf = project.getSourceFile(p.file);
  if (!sf) {
    errors.push(`File not found in project: ${p.file}`);
    return { ok: false, errors };
  }

  const targetClass = sf.getClass(p.target);
  if (!targetClass) {
    errors.push(`Class '${p.target}' not found in file`);
    return { ok: false, errors };
  }

  if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(p.factoryName)) {
    errors.push(`'${p.factoryName}' is not a valid identifier`);
  }

  const existingFactory = sf.getFunction(p.factoryName);
  if (existingFactory) {
    errors.push(`Function '${p.factoryName}' already exists in file`);
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

function apply(
  project: Project,
  p: ReplaceConstructorWithFactoryFunctionParams,
): RefactoringResult {
  const sf = project.getSourceFile(p.file);
  if (!sf) {
    return { success: false, filesChanged: [], description: `File not found: ${p.file}` };
  }

  const targetClass = sf.getClass(p.target);
  if (!targetClass) {
    return {
      success: false,
      filesChanged: [],
      description: `Class '${p.target}' not found`,
    };
  }

  const constructor = targetClass.getConstructors()[0];
  const constructorParams = constructor
    ? constructor
        .getParameters()
        .map((param) => param.getText())
        .join(", ")
    : "";

  const factoryText = buildFactorySignature(p.target, p.factoryName, constructorParams);

  // Replace new ClassName(...) calls with factoryName(...) throughout the file
  replaceNewExpressions(project, p.file, p.target, p.factoryName);

  // Add factory function after the class
  const refreshedFile = project.getSourceFile(p.file);
  if (refreshedFile) {
    refreshedFile.addStatements(`\n${factoryText}\n`);
  }

  return {
    success: true,
    filesChanged: [p.file],
    description: `Replaced constructor of '${p.target}' with factory function '${p.factoryName}'`,
  };
}

export const replaceConstructorWithFactoryFunction: RefactoringDefinition = {
  name: "Replace Constructor with Factory Function",
  kebabName: "replace-constructor-with-factory-function",
  description:
    "Introduces a named factory function for a class, replacing direct constructor calls with the factory.",
  tier: 4,
  params,
  preconditions: (project: Project, raw: unknown): PreconditionResult =>
    preconditions(project, params.validate(raw) as ReplaceConstructorWithFactoryFunctionParams),
  apply: (project: Project, raw: unknown): RefactoringResult =>
    apply(project, params.validate(raw) as ReplaceConstructorWithFactoryFunctionParams),
};
