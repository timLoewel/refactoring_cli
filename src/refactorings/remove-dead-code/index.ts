import { Node, SyntaxKind } from "ts-morph";
import type { Identifier, SourceFile } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { defineRefactoring, enumerate, param, resolve } from "../../core/refactoring-builder.js";
import type { SourceFileContext } from "../../core/refactoring.types.js";

/**
 * Remove named imports that are now unused after a declaration was removed.
 * Builds the used-name set from identifiers OUTSIDE import declarations to avoid
 * counting the import specifier itself as a usage.
 */
function removeUnusedImports(sf: SourceFile): void {
  const stillUsed = new Set<string>();
  for (const id of sf.getDescendantsOfKind(SyntaxKind.Identifier)) {
    let insideImport = false;
    let anc: ReturnType<typeof id.getParent> = id.getParent();
    while (anc) {
      if (Node.isImportDeclaration(anc)) {
        insideImport = true;
        break;
      }
      const next = anc.getParent();
      if (!next) break;
      anc = next;
    }
    if (!insideImport) stillUsed.add((id as Identifier).getText());
  }
  for (const importDecl of [...sf.getImportDeclarations()]) {
    let removedAny = false;
    for (const spec of [...importDecl.getNamedImports()]) {
      const local = spec.getAliasNode()?.getText() ?? spec.getNameNode().getText();
      if (!stillUsed.has(local)) {
        spec.remove();
        removedAny = true;
      }
    }
    if (
      removedAny &&
      importDecl.getNamedImports().length === 0 &&
      !importDecl.getDefaultImport() &&
      !importDecl.getNamespaceImport()
    ) {
      importDecl.remove();
    }
  }
}

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

    // Skip exported symbols — they may be imported by other files.
    if (funcDecl && funcDecl.isExported()) {
      errors.push(`Symbol '${target}' is exported and may be used in other files`);
      return { ok: false, errors };
    }
    if (varDecl) {
      const varStmt = varDecl.getParent()?.getParent();
      if (varStmt && Node.isVariableStatement(varStmt) && varStmt.isExported()) {
        errors.push(`Symbol '${target}' is exported and may be used in other files`);
        return { ok: false, errors };
      }
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
      removeUnusedImports(sf);
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

    removeUnusedImports(sf);
    return {
      success: true,
      filesChanged: [file],
      description: `Removed unused variable declaration '${target}'`,
    };
  },
  enumerate: enumerate.variablesAndFunctions,
});
