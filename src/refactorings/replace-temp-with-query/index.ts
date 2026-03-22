import { Node, SyntaxKind } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../engine/refactoring.types.js";
import { defineRefactoring, param, resolve } from "../../engine/refactoring-builder.js";
import type { SourceFileContext } from "../../engine/refactoring-builder.js";

export const replaceTempWithQuery = defineRefactoring<SourceFileContext>({
  name: "Replace Temp with Query",
  kebabName: "replace-temp-with-query",
  tier: 1,
  description:
    "Replaces a temporary variable with a call to a new extracted query function that computes the same value.",
  params: [
    param.file(),
    param.identifier("target", "Name of the temporary variable to replace"),
    param.identifier("name", "Name for the new query function"),
  ],
  resolve: (project, params) => resolve.sourceFile(project, params as { file: string }),
  preconditions(ctx: SourceFileContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const sf = ctx.sourceFile;
    const target = params["target"] as string;
    const name = params["name"] as string;

    const decl = sf
      .getDescendantsOfKind(SyntaxKind.VariableDeclaration)
      .find((d) => d.getName() === target);

    if (!decl) {
      errors.push(`Variable '${target}' not found in file`);
      return { ok: false, errors };
    }

    const initializer = decl.getInitializer();
    if (!initializer) {
      errors.push(`Variable '${target}' has no initializer`);
    }

    if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name)) {
      errors.push(`'${name}' is not a valid identifier`);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: SourceFileContext, params: Record<string, unknown>): RefactoringResult {
    const sf = ctx.sourceFile;
    const file = params["file"] as string;
    const target = params["target"] as string;
    const funcName = params["name"] as string;

    const decl = sf
      .getDescendantsOfKind(SyntaxKind.VariableDeclaration)
      .find((d) => d.getName() === target);

    if (!decl) {
      return {
        success: false,
        filesChanged: [],
        description: `Variable '${target}' not found`,
      };
    }

    const initializer = decl.getInitializer();
    if (!initializer) {
      return {
        success: false,
        filesChanged: [],
        description: `Variable '${target}' has no initializer`,
      };
    }

    const initText = initializer.getText();

    // Find the declaration's containing statement so we know where to insert the function
    const declStatement = decl.getParent();
    if (!declStatement) {
      return {
        success: false,
        filesChanged: [],
        description: `Could not locate declaration statement for '${target}'`,
      };
    }

    const scopeParent = declStatement.getParent();
    if (!scopeParent) {
      return {
        success: false,
        filesChanged: [],
        description: `Could not locate scope parent for '${target}'`,
      };
    }

    // Replace all identifier references to the temp variable with a call to the query function
    const references = sf.getDescendantsOfKind(SyntaxKind.Identifier).filter((id) => {
      if (id.getText() !== target) return false;
      const parent = id.getParent();
      if (!parent) return false;
      if (Node.isVariableDeclaration(parent) && parent.getNameNode() === id) return false;
      return true;
    });

    const sorted = [...references].sort((a, b) => b.getStart() - a.getStart());
    for (const ref of sorted) {
      ref.replaceWithText(`${funcName}()`);
    }

    // Remove the temp variable declaration
    if (Node.isVariableDeclarationList(declStatement)) {
      const listParent = declStatement.getParent();
      if (listParent && Node.isVariableStatement(listParent)) {
        listParent.remove();
      }
    } else if (Node.isVariableStatement(declStatement)) {
      declStatement.remove();
    }

    // Insert the query function at the top of the source file (before first statement)
    sf.insertStatements(0, `function ${funcName}(): number {\n  return ${initText};\n}\n`);

    return {
      success: true,
      filesChanged: [file],
      description: `Replaced temp variable '${target}' with query function '${funcName}()'`,
    };
  },
});
