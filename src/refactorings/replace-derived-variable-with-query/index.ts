import { SyntaxKind } from "ts-morph";
import type { Project } from "ts-morph";
import type {
  RefactoringDefinition,
  ParamSchema,
  PreconditionResult,
  RefactoringResult,
} from "../../engine/refactoring.types.js";

interface ReplaceDerivedVariableWithQueryParams {
  file: string;
  target: string;
}

const params: ParamSchema = {
  definitions: [
    { name: "file", type: "string", description: "Path to the TypeScript file", required: true },
    {
      name: "target",
      type: "string",
      description: "Name of the derived variable or class field to convert into a getter",
      required: true,
    },
  ],
  validate(raw: unknown): ReplaceDerivedVariableWithQueryParams {
    const r = raw as Record<string, unknown>;
    if (typeof r["file"] !== "string" || r["file"].trim() === "") {
      throw new Error("param 'file' must be a non-empty string");
    }
    if (typeof r["target"] !== "string" || r["target"].trim() === "") {
      throw new Error("param 'target' must be a non-empty string");
    }
    return {
      file: r["file"] as string,
      target: r["target"] as string,
    };
  },
};

function preconditions(
  project: Project,
  p: ReplaceDerivedVariableWithQueryParams,
): PreconditionResult {
  const errors: string[] = [];

  const sf = project.getSourceFile(p.file);
  if (!sf) {
    errors.push(`File not found in project: ${p.file}`);
    return { ok: false, errors };
  }

  // Look for the field in any class in the file
  const classes = sf.getDescendantsOfKind(SyntaxKind.ClassDeclaration);
  const found = classes.some((cls) => {
    const prop = cls.getProperty(p.target);
    return prop !== undefined;
  });

  if (!found) {
    errors.push(`No class property named '${p.target}' found in file: ${p.file}`);
  }

  return { ok: errors.length === 0, errors };
}

function apply(project: Project, p: ReplaceDerivedVariableWithQueryParams): RefactoringResult {
  const sf = project.getSourceFile(p.file);
  if (!sf) {
    return { success: false, filesChanged: [], description: `File not found: ${p.file}` };
  }

  const classes = sf.getDescendantsOfKind(SyntaxKind.ClassDeclaration);
  let converted = false;

  for (const cls of classes) {
    const prop = cls.getProperty(p.target);
    if (!prop) continue;

    const initializer = prop.getInitializer();
    if (!initializer) continue;

    const typeNode = prop.getTypeNode();
    const returnType = typeNode ? typeNode.getText() : "unknown";
    const initText = initializer.getText();

    // Add a getter that computes the value
    cls.addGetAccessor({
      name: p.target,
      returnType,
      statements: `return ${initText};`,
    });

    // Remove the original property
    prop.remove();

    converted = true;
    break;
  }

  if (!converted) {
    return {
      success: false,
      filesChanged: [],
      description: `Could not find property '${p.target}' with an initializer to convert`,
    };
  }

  return {
    success: true,
    filesChanged: [p.file],
    description: `Converted derived field '${p.target}' into a computed getter`,
  };
}

export const replaceDerivedVariableWithQuery: RefactoringDefinition = {
  name: "Replace Derived Variable With Query",
  kebabName: "replace-derived-variable-with-query",
  description: "Replaces a class field that holds a derived value with a computed getter method.",
  tier: 2,
  params,
  preconditions: (project: Project, raw: unknown): PreconditionResult =>
    preconditions(project, params.validate(raw) as ReplaceDerivedVariableWithQueryParams),
  apply: (project: Project, raw: unknown): RefactoringResult =>
    apply(project, params.validate(raw) as ReplaceDerivedVariableWithQueryParams),
};
