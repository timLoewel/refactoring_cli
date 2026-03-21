import { SyntaxKind } from "ts-morph";
import type { Project } from "ts-morph";
import type {
  RefactoringDefinition,
  ParamSchema,
  PreconditionResult,
  RefactoringResult,
} from "../../engine/refactoring.types.js";

interface ReplaceCommandWithFunctionParams {
  file: string;
  target: string;
}

const params: ParamSchema = {
  definitions: [
    { name: "file", type: "string", description: "Path to the TypeScript file", required: true },
    {
      name: "target",
      type: "string",
      description: "Name of the command class to convert into a function",
      required: true,
    },
  ],
  validate(raw: unknown): ReplaceCommandWithFunctionParams {
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

function preconditions(project: Project, p: ReplaceCommandWithFunctionParams): PreconditionResult {
  const errors: string[] = [];

  const sf = project.getSourceFile(p.file);
  if (!sf) {
    errors.push(`File not found in project: ${p.file}`);
    return { ok: false, errors };
  }

  const cls = sf
    .getDescendantsOfKind(SyntaxKind.ClassDeclaration)
    .find((c) => c.getName() === p.target);
  if (!cls) {
    errors.push(`Class '${p.target}' not found in file: ${p.file}`);
    return { ok: false, errors };
  }

  const executeMethod = cls.getMethod("execute");
  if (!executeMethod) {
    errors.push(`Class '${p.target}' does not have an 'execute' method`);
  }

  const constructor = cls.getConstructors()[0];
  if (!constructor) {
    errors.push(`Class '${p.target}' does not have a constructor`);
  }

  return { ok: errors.length === 0, errors };
}

function apply(project: Project, p: ReplaceCommandWithFunctionParams): RefactoringResult {
  const sf = project.getSourceFile(p.file);
  if (!sf) {
    return { success: false, filesChanged: [], description: `File not found: ${p.file}`, diff: [] };
  }

  const cls = sf
    .getDescendantsOfKind(SyntaxKind.ClassDeclaration)
    .find((c) => c.getName() === p.target);
  if (!cls) {
    return {
      success: false,
      filesChanged: [],
      description: `Class '${p.target}' not found`,
      diff: [],
    };
  }

  const executeMethod = cls.getMethod("execute");
  if (!executeMethod) {
    return {
      success: false,
      filesChanged: [],
      description: `Class '${p.target}' has no 'execute' method`,
      diff: [],
    };
  }

  const constructors = cls.getConstructors();
  if (constructors.length === 0) {
    return {
      success: false,
      filesChanged: [],
      description: `Class '${p.target}' has no constructor`,
      diff: [],
    };
  }

  const ctor = constructors[0];
  if (!ctor) {
    return {
      success: false,
      filesChanged: [],
      description: `Class '${p.target}' has no constructor`,
      diff: [],
    };
  }
  const ctorParams = ctor.getParameters();

  const returnTypeNode = executeMethod.getReturnTypeNode();
  const returnType = returnTypeNode ? returnTypeNode.getText() : "void";

  const body = executeMethod.getBody();
  const bodyText = body ? body.getText() : "{}";

  // Derive function parameter list from constructor params
  const fnParamList = ctorParams
    .map((cp) => {
      const typeNode = cp.getTypeNode();
      const typeName = typeNode ? typeNode.getText() : "unknown";
      return `${cp.getName()}: ${typeName}`;
    })
    .join(", ");

  // Replace this.field references in execute body with plain parameter names
  let fnBody = bodyText;
  for (const cp of ctorParams) {
    const name = cp.getName();
    fnBody = fnBody.replace(new RegExp(`this\\.${name}\\b`, "g"), name);
  }

  const functionName = p.target.charAt(0).toLowerCase() + p.target.slice(1);
  const fnText = `function ${functionName}(${fnParamList}): ${returnType} ${fnBody}`;

  // Remove the class and add the function
  cls.remove();
  sf.addStatements(`\n${fnText}\n`);

  return {
    success: true,
    filesChanged: [p.file],
    description: `Converted command class '${p.target}' into function '${functionName}'`,
    diff: [],
  };
}

export const replaceCommandWithFunction: RefactoringDefinition = {
  name: "Replace Command With Function",
  kebabName: "replace-command-with-function",
  description: "Converts a command class with an execute method back into a plain function.",
  tier: 2,
  params,
  preconditions: (project: Project, raw: unknown): PreconditionResult =>
    preconditions(project, params.validate(raw) as ReplaceCommandWithFunctionParams),
  apply: (project: Project, raw: unknown): RefactoringResult =>
    apply(project, params.validate(raw) as ReplaceCommandWithFunctionParams),
};
