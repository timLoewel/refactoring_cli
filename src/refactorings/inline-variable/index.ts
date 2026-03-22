import { Node, SyntaxKind } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { defineRefactoring, param, resolve } from "../../core/refactoring-builder.js";
import type { SourceFileContext } from "../../core/refactoring.types.js";

export const inlineVariable = defineRefactoring<SourceFileContext>({
  name: "Inline Variable",
  kebabName: "inline-variable",
  tier: 1,
  description:
    "Replaces all references to a variable with its initializer expression and removes the declaration.",
  params: [param.file(), param.identifier("target", "Name of the variable to inline")],
  resolve: (project, params) => resolve.sourceFile(project, params as { file: string }),
  preconditions(ctx: SourceFileContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const sf = ctx.sourceFile;
    const target = params["target"] as string;

    const decl = sf
      .getDescendantsOfKind(SyntaxKind.VariableDeclaration)
      .find((d) => d.getName() === target);

    if (!decl) {
      errors.push(`Variable '${target}' not found in file`);
      return { ok: false, errors };
    }

    const initializer = decl.getInitializer();
    if (!initializer) {
      errors.push(`Variable '${target}' has no initializer and cannot be inlined`);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: SourceFileContext, params: Record<string, unknown>): RefactoringResult {
    const sf = ctx.sourceFile;
    const file = params["file"] as string;
    const target = params["target"] as string;

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

    // Find all identifier references to this variable (excluding the declaration itself)
    const references = sf.getDescendantsOfKind(SyntaxKind.Identifier).filter((id) => {
      if (id.getText() !== target) return false;
      const parent = id.getParent();
      if (!parent) return false;
      // Exclude the declaration name itself
      if (Node.isVariableDeclaration(parent) && parent.getNameNode() === id) return false;
      return true;
    });

    // Replace in reverse order to preserve positions
    const sorted = [...references].sort((a, b) => b.getStart() - a.getStart());
    for (const ref of sorted) {
      ref.replaceWithText(initText);
    }

    // Remove the variable declaration statement
    const declStatement = decl.getParent();
    if (!declStatement) {
      return {
        success: false,
        filesChanged: [],
        description: `Could not locate declaration statement for '${target}'`,
      };
    }
    const declStatementParent = declStatement.getParent();
    if (!declStatementParent) {
      return {
        success: false,
        filesChanged: [],
        description: `Could not locate parent of declaration statement for '${target}'`,
      };
    }

    if (Node.isVariableDeclarationList(declStatement)) {
      const list = declStatement;
      const listParent = list.getParent();
      if (listParent && Node.isVariableStatement(listParent)) {
        listParent.remove();
      }
    } else if (Node.isVariableStatement(declStatement)) {
      declStatement.remove();
    }

    return {
      success: true,
      filesChanged: [file],
      description: `Inlined variable '${target}' with its initializer '${initText}'`,
    };
  },
});
