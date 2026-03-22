import { SyntaxKind } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../engine/refactoring.types.js";
import { defineRefactoring, param, resolve } from "../../engine/refactoring-builder.js";
import type { SourceFileContext } from "../../engine/refactoring-builder.js";

function buildAccessorFunctions(varName: string, typeText: string, initializer: string): string {
  const capitalized = varName.charAt(0).toUpperCase() + varName.slice(1);
  return (
    `\nlet _${varName}: ${typeText} = ${initializer};\n\n` +
    `export function get${capitalized}(): ${typeText} {\n  return _${varName};\n}\n\n` +
    `export function set${capitalized}(value: ${typeText}): void {\n  _${varName} = value;\n}\n`
  );
}

export const encapsulateVariable = defineRefactoring<SourceFileContext>({
  name: "Encapsulate Variable",
  kebabName: "encapsulate-variable",
  tier: 3,
  description:
    "Replaces a module-level variable with a pair of exported getter and setter functions.",
  params: [
    param.file(),
    param.identifier("target", "Name of the module-level variable to encapsulate"),
  ],
  resolve: (project, params) => resolve.sourceFile(project, params as { file: string }),
  preconditions(ctx: SourceFileContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const sf = ctx.sourceFile;
    const target = params["target"] as string;
    const file = params["file"] as string;

    const varDecl = sf.getVariableDeclaration(target);
    if (!varDecl) {
      errors.push(`Variable '${target}' not found at module level in file: ${file}`);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: SourceFileContext, params: Record<string, unknown>): RefactoringResult {
    const sf = ctx.sourceFile;
    const file = params["file"] as string;
    const target = params["target"] as string;

    const varDecl = sf.getVariableDeclaration(target);
    if (!varDecl) {
      return {
        success: false,
        filesChanged: [],
        description: `Variable '${target}' not found`,
      };
    }

    const typeNode = varDecl.getTypeNode();
    const typeText = typeNode?.getText() ?? "unknown";
    const initializer = varDecl.getInitializer()?.getText() ?? "undefined";

    const varStatement = varDecl.getParent()?.getParent();
    if (varStatement && varStatement.getKind() === SyntaxKind.VariableStatement) {
      varStatement.replaceWithText(buildAccessorFunctions(target, typeText, initializer));
    } else {
      return {
        success: false,
        filesChanged: [],
        description: `Could not locate the variable statement for '${target}'`,
      };
    }

    return {
      success: true,
      filesChanged: [file],
      description: `Encapsulated variable '${target}' with get/set accessor functions`,
    };
  },
});
