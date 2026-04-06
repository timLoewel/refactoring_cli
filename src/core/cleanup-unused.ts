import { SyntaxKind, ts } from "ts-morph";
import type { SourceFile } from "ts-morph";

/**
 * Remove unused imports and variable declarations from a source file.
 * Uses the TypeScript compiler's TS6133 diagnostic ("declared but never read")
 * to identify candidates. Safe to call after any refactoring transformation.
 */
export function cleanupUnused(sourceFile: SourceFile): void {
  // Iterate: removing one unused decl can make others unused (e.g., an import
  // used only by a now-removed variable). Cap at 3 passes to avoid infinite loops.
  for (let pass = 0; pass < 3; pass++) {
    const diagnostics = sourceFile
      .getPreEmitDiagnostics()
      .filter((d) => d.getCode() === 6133 || d.getCode() === 6196);

    if (diagnostics.length === 0) break;

    // Collect positions of unused declarations (deduplicated)
    const unusedPositions = new Set<number>();
    for (const d of diagnostics) {
      const start = d.getStart();
      if (start !== undefined) unusedPositions.add(start);
    }

    // Find and remove unused import specifiers and variable declarations.
    // Process in reverse position order to keep earlier positions stable.
    const removals: Array<{ pos: number; remove: () => void }> = [];

    // Check import declarations
    for (const importDecl of sourceFile.getImportDeclarations()) {
      const namedImports = importDecl.getNamedImports();
      const defaultImport = importDecl.getDefaultImport();
      const importStart = importDecl.getStart();

      // The diagnostic position may point to the import declaration itself OR
      // to the individual specifier. Check both.
      const isUnusedSpecifier = (n: { getStart(): number; getNameNode(): { getStart(): number } }) =>
        unusedPositions.has(n.getStart()) || unusedPositions.has(n.getNameNode().getStart());

      const unusedNamed = namedImports.filter(
        (n) => unusedPositions.has(n.getStart()) || unusedPositions.has(n.getNameNode().getStart()),
      );

      // If the diagnostic points to the import declaration start and there's only named imports
      if (unusedPositions.has(importStart) && namedImports.length > 0 && !defaultImport) {
        removals.push({ pos: importStart, remove: () => importDecl.remove() });
        continue;
      }

      if (unusedNamed.length === namedImports.length && namedImports.length > 0 && !defaultImport) {
        removals.push({ pos: importStart, remove: () => importDecl.remove() });
      } else {
        for (const n of unusedNamed) {
          removals.push({ pos: n.getStart(), remove: () => n.remove() });
        }
      }

      // Check default import
      if (defaultImport && (unusedPositions.has(defaultImport.getStart()) || unusedPositions.has(importStart))) {
        if (namedImports.length === 0 || unusedNamed.length === namedImports.length) {
          removals.push({ pos: importStart, remove: () => importDecl.remove() });
        } else {
          removals.push({
            pos: defaultImport.getStart(),
            remove: () => importDecl.removeDefaultImport(),
          });
        }
      }
    }

    // Check variable statements (including nested ones inside function bodies)
    for (const varStmt of sourceFile.getDescendantsOfKind(SyntaxKind.VariableStatement)) {
      const decls = varStmt.getDeclarations();
      const unusedDecls = decls.filter((d) => unusedPositions.has(d.getNameNode().getStart()));

      if (unusedDecls.length === decls.length) {
        // All declarations in this statement are unused — remove the whole statement
        removals.push({ pos: varStmt.getStart(), remove: () => varStmt.remove() });
      } else {
        for (const d of unusedDecls) {
          removals.push({ pos: d.getStart(), remove: () => d.remove() });
        }
      }
    }

    if (removals.length === 0) break;

    // Sort by descending position and apply
    removals.sort((a, b) => b.pos - a.pos);
    for (const { remove } of removals) {
      try {
        remove();
      } catch {
        // Node may already have been removed by a parent removal — safe to ignore
      }
    }
  }
}
