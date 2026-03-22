import { SyntaxKind } from "ts-morph";
import type { Project } from "ts-morph";
import type {
  RefactoringDefinition,
  ParamSchema,
  PreconditionResult,
  RefactoringResult,
} from "../../engine/refactoring.types.js";

interface EncapsulateVariableParams {
  file: string;
  target: string;
}

const params: ParamSchema = {
  definitions: [
    { name: "file", type: "string", description: "Path to the TypeScript file", required: true },
    {
      name: "target",
      type: "string",
      description: "Name of the module-level variable to encapsulate",
      required: true,
    },
  ],
  validate(raw: unknown): EncapsulateVariableParams {
    const r = raw as Record<string, unknown>;
    if (typeof r["file"] !== "string" || r["file"].trim() === "") {
      throw new Error("param 'file' must be a non-empty string");
    }
    if (typeof r["target"] !== "string" || r["target"].trim() === "") {
      throw new Error("param 'target' must be a non-empty string");
    }
    return { file: r["file"] as string, target: r["target"] as string };
  },
};

function preconditions(project: Project, p: EncapsulateVariableParams): PreconditionResult {
  const errors: string[] = [];

  const sf = project.getSourceFile(p.file);
  if (!sf) {
    errors.push(`File not found in project: ${p.file}`);
    return { ok: false, errors };
  }

  const varDecl = sf.getVariableDeclaration(p.target);
  if (!varDecl) {
    errors.push(`Variable '${p.target}' not found at module level in file: ${p.file}`);
  }

  return { ok: errors.length === 0, errors };
}

function buildAccessorFunctions(varName: string, typeText: string, initializer: string): string {
  const capitalized = varName.charAt(0).toUpperCase() + varName.slice(1);
  return (
    `\nlet _${varName}: ${typeText} = ${initializer};\n\n` +
    `export function get${capitalized}(): ${typeText} {\n  return _${varName};\n}\n\n` +
    `export function set${capitalized}(value: ${typeText}): void {\n  _${varName} = value;\n}\n`
  );
}

function apply(project: Project, p: EncapsulateVariableParams): RefactoringResult {
  const sf = project.getSourceFile(p.file);
  if (!sf) {
    return { success: false, filesChanged: [], description: `File not found: ${p.file}` };
  }

  const varDecl = sf.getVariableDeclaration(p.target);
  if (!varDecl) {
    return {
      success: false,
      filesChanged: [],
      description: `Variable '${p.target}' not found`,
    };
  }

  const typeNode = varDecl.getTypeNode();
  const typeText = typeNode?.getText() ?? "unknown";
  const initializer = varDecl.getInitializer()?.getText() ?? "undefined";

  // Find and remove the variable statement
  const varStatement = varDecl.getParent()?.getParent();
  if (varStatement && varStatement.getKind() === SyntaxKind.VariableStatement) {
    varStatement.replaceWithText(buildAccessorFunctions(p.target, typeText, initializer));
  } else {
    return {
      success: false,
      filesChanged: [],
      description: `Could not locate the variable statement for '${p.target}'`,
    };
  }

  return {
    success: true,
    filesChanged: [p.file],
    description: `Encapsulated variable '${p.target}' with get/set accessor functions`,
  };
}

export const encapsulateVariable: RefactoringDefinition = {
  name: "Encapsulate Variable",
  kebabName: "encapsulate-variable",
  description:
    "Replaces a module-level variable with a pair of exported getter and setter functions.",
  tier: 3,
  params,
  preconditions: (project: Project, raw: unknown): PreconditionResult =>
    preconditions(project, params.validate(raw) as EncapsulateVariableParams),
  apply: (project: Project, raw: unknown): RefactoringResult =>
    apply(project, params.validate(raw) as EncapsulateVariableParams),
};
