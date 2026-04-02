import { Node, SyntaxKind, type Identifier } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { defineRefactoring, param, resolve } from "../../core/refactoring-builder.js";
import type { SourceFileContext } from "../../core/refactoring.types.js";

/**
 * Returns true if the identifier is a genuine value reference — i.e. it refers to
 * the variable in expression context. Returns false for positions where an identifier
 * happens to share the name but is not a reference: property access names (`obj.x`),
 * object-literal keys (`{ x: 1 }`), and shorthand property keys (`{ x }`).
 */
function isValueReference(id: Identifier): boolean {
  const parent = id.getParent();
  if (!parent) return true;
  // `obj.x` — the right-hand side of a property access is a name, not a reference
  if (Node.isPropertyAccessExpression(parent) && parent.getNameNode() === id) return false;
  // `{ x: 1 }` — the key of a PropertyAssignment is a name, not a reference
  if (Node.isPropertyAssignment(parent) && parent.getNameNode() === id) return false;
  // `{ x }` — shorthand property name
  if (Node.isShorthandPropertyAssignment(parent)) return false;
  return true;
}

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
      return { ok: false, errors };
    }

    // Refuse to inline a side-effect initializer (call expression) used more than once,
    // as that would change how many times the function is called.
    const hasSideEffect = initializer.getDescendantsOfKind(SyntaxKind.CallExpression).length > 0;
    if (hasSideEffect) {
      const refCount = sf.getDescendantsOfKind(SyntaxKind.Identifier).filter((id) => {
        if (id.getText() !== target) return false;
        const parent = id.getParent();
        if (!parent) return false;
        if (Node.isVariableDeclaration(parent) && parent.getNameNode() === id) return false;
        return isValueReference(id);
      }).length;
      if (refCount > 1) {
        errors.push(
          `Variable '${target}' has a side-effect initializer and is used ${refCount} times. ` +
            `Inlining would change how many times the function is called. ` +
            `Inline manually or ensure the initializer is pure.`,
        );
      }
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
    // Wrap in parens if initializer is a complex expression that could change
    // semantics when inlined into a surrounding expression (e.g. `a + b` inlined
    // into `sum * 2` would give `a + b * 2` without parens).
    const needsParens =
      Node.isBinaryExpression(initializer) || Node.isConditionalExpression(initializer);
    const inlineText = needsParens ? `(${initText})` : initText;

    // Find all identifier references to this variable (excluding the declaration itself and
    // non-reference positions like property access names and object-literal keys).
    const refPositions = sf
      .getDescendantsOfKind(SyntaxKind.Identifier)
      .filter((id) => {
        if (id.getText() !== target) return false;
        const parent = id.getParent();
        if (!parent) return false;
        // Exclude the declaration name itself
        if (Node.isVariableDeclaration(parent) && parent.getNameNode() === id) return false;
        return isValueReference(id);
      })
      .map((id) => id.getStart())
      .sort((a, b) => b - a); // reverse order so later replacements don't shift earlier positions

    // Replace references by re-finding each by position (stable across mutations)
    for (const pos of refPositions) {
      const id = sf.getDescendantAtPos(pos);
      if (id && Node.isIdentifier(id) && id.getText() === target) {
        id.replaceWithText(inlineText);
      }
    }

    // Re-find the declaration after mutations (original node may be stale)
    const freshDecl = sf
      .getDescendantsOfKind(SyntaxKind.VariableDeclaration)
      .find((d) => d.getName() === target);
    if (freshDecl) {
      const list = freshDecl.getParent();
      if (list && Node.isVariableDeclarationList(list)) {
        const stmt = list.getParent();
        if (stmt && Node.isVariableStatement(stmt)) {
          stmt.remove();
        }
      }
    }

    // Remove named imports that are now unused (e.g. a type annotation import that was
    // only referenced in the removed declaration).
    // Build the set of names still used OUTSIDE of import declarations — identifiers
    // inside import specifiers must not count as "still used".
    const stillUsedNames = new Set<string>();
    for (const id of sf.getDescendantsOfKind(SyntaxKind.Identifier)) {
      let insideImport = false;
      let ancestor: ReturnType<typeof id.getParent> = id.getParent();
      while (ancestor) {
        if (Node.isImportDeclaration(ancestor)) {
          insideImport = true;
          break;
        }
        const next = ancestor.getParent();
        if (!next) break;
        ancestor = next;
      }
      if (!insideImport) stillUsedNames.add(id.getText());
    }

    for (const importDecl of [...sf.getImportDeclarations()]) {
      let removedAny = false;
      for (const specifier of [...importDecl.getNamedImports()]) {
        const localName = specifier.getAliasNode()?.getText() ?? specifier.getNameNode().getText();
        if (!stillUsedNames.has(localName)) {
          specifier.remove();
          removedAny = true;
        }
      }
      // Only remove the entire import declaration if we actually removed specifiers from it
      // AND none remain — never remove side-effect imports (import "x") that we never touched.
      if (
        removedAny &&
        importDecl.getNamedImports().length === 0 &&
        !importDecl.getDefaultImport() &&
        !importDecl.getNamespaceImport()
      ) {
        importDecl.remove();
      }
    }

    return {
      success: true,
      filesChanged: [file],
      description: `Inlined variable '${target}' with its initializer '${initText}'`,
    };
  },
});
