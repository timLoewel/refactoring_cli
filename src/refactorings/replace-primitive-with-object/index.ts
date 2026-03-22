import { SyntaxKind } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../engine/refactoring.types.js";
import {
  defineRefactoring,
  fileParam,
  identifierParam,
  resolveSourceFile,
} from "../../engine/refactoring-builder.js";
import type { SourceFileContext } from "../../engine/refactoring-builder.js";

function buildWrapperClass(className: string, primitiveType: string): string {
  return (
    `\nclass ${className} {\n` +
    `  private readonly _value: ${primitiveType};\n\n` +
    `  constructor(value: ${primitiveType}) {\n    this._value = value;\n  }\n\n` +
    `  getValue(): ${primitiveType} { return this._value; }\n\n` +
    `  toString(): string { return String(this._value); }\n` +
    `}\n`
  );
}

export const replacePrimitiveWithObject = defineRefactoring<SourceFileContext>({
  name: "Replace Primitive With Object",
  kebabName: "replace-primitive-with-object",
  tier: 3,
  description:
    "Creates a wrapper class for a primitive-typed variable, replacing its usage with an instance of the class.",
  params: [
    fileParam(),
    identifierParam("target", "Name of the variable or parameter to wrap"),
    identifierParam("className", "Name of the wrapper class to create"),
  ],
  resolve: (project, params) =>
    resolveSourceFile(project, params as { file: string }),
  preconditions(ctx: SourceFileContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const sf = ctx.sourceFile;
    const target = params["target"] as string;
    const className = params["className"] as string;
    const file = params["file"] as string;

    const existing = sf
      .getDescendantsOfKind(SyntaxKind.ClassDeclaration)
      .find((c) => c.getName() === className);
    if (existing) {
      errors.push(`Class '${className}' already exists in file`);
    }

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
    const className = params["className"] as string;

    const varDecl = sf.getVariableDeclaration(target);
    if (!varDecl) {
      return {
        success: false,
        filesChanged: [],
        description: `Variable '${target}' not found`,
      };
    }

    const primitiveType = varDecl.getTypeNode()?.getText() ?? "unknown";
    const initializerText = varDecl.getInitializer()?.getText() ?? "undefined";

    sf.addStatements(buildWrapperClass(className, primitiveType));

    varDecl.setType(className);
    varDecl.setInitializer(`new ${className}(${initializerText})`);

    return {
      success: true,
      filesChanged: [file],
      description: `Wrapped primitive variable '${target}' in new class '${className}'`,
    };
  },
});
