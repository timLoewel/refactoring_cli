import { Node, SyntaxKind } from "ts-morph";
import type { SourceFile } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../engine/refactoring.types.js";
import { defineRefactoring, param, resolve } from "../../engine/refactoring-builder.js";
import type { SourceFileContext } from "../../engine/refactoring-builder.js";

/**
 * Count the number of references to `name` that are not the declaration itself.
 */
function countUsages(sf: SourceFile, name: string): number {
  const allIdentifiers = sf.getDescendantsOfKind(SyntaxKind.Identifier).filter((id) => {
    if (id.getText() !== name) return false;
    const parent = id.getParent();
    if (!parent) return false;
    // Exclude function declaration name
    if (Node.isFunctionDeclaration(parent) && parent.getNameNode() === id) return false;
    // Exclude variable declaration name
    if (Node.isVariableDeclaration(parent) && parent.getNameNode() === id) return false;
    return true;
  });

  return allIdentifiers.length;
}

export const removeDeadCode = defineRefactoring<SourceFileContext>({
  name: "Remove Dead Code",
  kebabName: "remove-dead-code",
  tier: 1,
  description:
    "Removes an unused function or variable declaration that is never referenced in the file.",
  params: [
    param.file(),
    param.identifier("target", "Name of the unused function or variable declaration to remove"),
  ],
  resolve: (project, params) => resolve.sourceFile(project, params as { file: string }),
  preconditions(ctx: SourceFileContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const sf = ctx.sourceFile;
    const target = params["target"] as string;
    const file = params["file"] as string;

    // Check that a function or variable with this name exists
    const funcDecl = sf
      .getDescendantsOfKind(SyntaxKind.FunctionDeclaration)
      .find((d) => d.getName() === target);

    const varDecl = sf
      .getDescendantsOfKind(SyntaxKind.VariableDeclaration)
      .find((d) => d.getName() === target);

    if (!funcDecl && !varDecl) {
      errors.push(`No function or variable named '${target}' found in file: ${file}`);
      return { ok: false, errors };
    }

    const usageCount = countUsages(sf, target);
    if (usageCount > 0) {
      errors.push(`Symbol '${target}' has ${usageCount} usage(s) and is not dead code`);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: SourceFileContext, params: Record<string, unknown>): RefactoringResult {
    const sf = ctx.sourceFile;
    const file = params["file"] as string;
    const target = params["target"] as string;

    // Try function declaration first
    const funcDecl = sf
      .getDescendantsOfKind(SyntaxKind.FunctionDeclaration)
      .find((d) => d.getName() === target);

    if (funcDecl) {
      funcDecl.remove();
      return {
        success: true,
        filesChanged: [file],
        description: `Removed unused function declaration '${target}'`,
      };
    }

    // Try variable declaration
    const varDecl = sf
      .getDescendantsOfKind(SyntaxKind.VariableDeclaration)
      .find((d) => d.getName() === target);

    if (!varDecl) {
      return {
        success: false,
        filesChanged: [],
        description: `No function or variable named '${target}' found`,
      };
    }

    // Remove the containing variable statement
    const declList = varDecl.getParent();
    if (declList && Node.isVariableDeclarationList(declList)) {
      const stmt = declList.getParent();
      if (stmt && Node.isVariableStatement(stmt)) {
        stmt.remove();
      } else {
        varDecl.remove();
      }
    } else {
      varDecl.remove();
    }

    return {
      success: true,
      filesChanged: [file],
      description: `Removed unused variable declaration '${target}'`,
    };
  },
});
