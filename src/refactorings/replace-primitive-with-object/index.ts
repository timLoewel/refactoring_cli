import { Node, SyntaxKind } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { defineRefactoring, enumerate, param, resolve } from "../../core/refactoring-builder.js";
import type { SourceFileContext } from "../../core/refactoring.types.js";

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
    param.file(),
    param.identifier("target", "Name of the variable or parameter to wrap"),
    param.identifier("className", "Name of the wrapper class to create"),
  ],
  resolve: (project, params) => resolve.sourceFile(project, params as { file: string }),
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
      return { ok: false, errors };
    }

    // Only meaningful for primitive types; reject complex object/interface types
    const explicitType = varDecl.getTypeNode()?.getText();
    const primitiveTypes = new Set(["string", "number", "boolean", "bigint", "unknown", "any"]);
    if (explicitType && !primitiveTypes.has(explicitType)) {
      errors.push(
        `Variable '${target}' has type '${explicitType}' which is not a primitive. ` +
          `This refactoring is intended for string, number, boolean, or bigint variables.`,
      );
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

    // Insert wrapper class BEFORE the variable statement so the class is declared
    // before it is used (class declarations are not hoisted like function declarations).
    const varStmt = varDecl.getParent()?.getParent();
    const stmts = sf.getStatements();
    const stmtIdx = stmts.findIndex((s) => s === varStmt);
    const insertIdx = stmtIdx >= 0 ? stmtIdx : stmts.length;
    sf.insertStatements(insertIdx, buildWrapperClass(className, primitiveType));

    // Re-find the declaration after the insertion (positions shifted)
    const freshDecl = sf.getVariableDeclaration(target);
    if (!freshDecl) {
      return {
        success: false,
        filesChanged: [],
        description: `Variable '${target}' not found after insertion`,
      };
    }

    freshDecl.setType(className);
    freshDecl.setInitializer(`new ${className}(${initializerText})`);

    // Wrap assignment RHS values in new ClassName(...)
    const assignments = sf
      .getDescendantsOfKind(SyntaxKind.BinaryExpression)
      .filter((bin) => {
        if (bin.getOperatorToken().getKind() !== SyntaxKind.EqualsToken) return false;
        const left = bin.getLeft();
        return Node.isIdentifier(left) && left.getText() === target;
      })
      .sort((a, b) => b.getStart() - a.getStart());

    for (const assign of assignments) {
      const rhs = assign.getRight();
      // Skip if already wrapped
      if (Node.isNewExpression(rhs) && rhs.getExpression().getText() === className) continue;
      rhs.replaceWithText(`new ${className}(${rhs.getText()})`);
    }

    return {
      success: true,
      filesChanged: [file],
      description: `Wrapped primitive variable '${target}' in new class '${className}'`,
    };
  },
  enumerate: enumerate.variables,
});
