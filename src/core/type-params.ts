import { Node, SyntaxKind } from "ts-morph";
import type { TypeParameterDeclaration } from "ts-morph";

/**
 * Find type parameters from enclosing generic scopes (functions, methods, classes,
 * arrow functions) that are referenced in the given node — either directly in type
 * annotations or indirectly through variables whose types involve the type params.
 *
 * Returns an array with a single formatted string like `["<T, U extends Foo>"]`,
 * or an empty array if no type params are referenced.
 */
export function findReferencedTypeParams(node: Node): string[] {
  // Collect all type parameter declarations from enclosing scopes (outermost first)
  const scopeTypeParams: TypeParameterDeclaration[][] = [];
  let current: Node | undefined = node.getParent();
  while (current) {
    if (
      Node.isFunctionDeclaration(current) ||
      Node.isArrowFunction(current) ||
      Node.isFunctionExpression(current) ||
      Node.isMethodDeclaration(current) ||
      Node.isClassDeclaration(current)
    ) {
      const tps = current.getTypeParameters();
      if (tps.length > 0) scopeTypeParams.push(tps);
    }
    current = current.getParent();
  }
  // Reverse so outermost scope's params come first
  scopeTypeParams.reverse();
  const enclosingTypeParams = scopeTypeParams.flat();

  if (enclosingTypeParams.length === 0) return [];

  const typeParamNames = new Set(enclosingTypeParams.map((tp) => tp.getName()));

  // 1. Direct references: type param names appearing as identifiers or type references
  const referencedNames = new Set<string>();
  for (const id of node.getDescendantsOfKind(SyntaxKind.Identifier)) {
    if (typeParamNames.has(id.getText())) {
      referencedNames.add(id.getText());
    }
  }
  for (const typeRef of node.getDescendantsOfKind(SyntaxKind.TypeReference)) {
    const typeName = typeRef.getTypeName();
    if (Node.isIdentifier(typeName) && typeParamNames.has(typeName.getText())) {
      referencedNames.add(typeName.getText());
    }
  }

  // 2. Indirect references: variables/params used in the node whose types involve type params
  for (const id of node.getDescendantsOfKind(SyntaxKind.Identifier)) {
    // Skip identifiers that are declaration names, property names, etc.
    const parent = id.getParent();
    if (!parent) continue;
    if (Node.isPropertyAccessExpression(parent) && parent.getNameNode() === id) continue;
    if (Node.isVariableDeclaration(parent) && parent.getNameNode() === id) continue;
    if (Node.isParameterDeclaration(parent) && parent.getNameNode() === id) continue;

    const sym = id.getSymbol();
    if (!sym) continue;
    const decls = sym.getDeclarations();
    if (!decls || decls.length === 0) continue;

    for (const decl of decls) {
      // Check explicit type annotations on the declaration
      if (Node.isVariableDeclaration(decl) || Node.isParameterDeclaration(decl)) {
        const typeNode = decl.getTypeNode();
        if (typeNode) {
          for (const ref of typeNode.getDescendantsOfKind(SyntaxKind.TypeReference)) {
            const name = ref.getTypeName();
            if (Node.isIdentifier(name) && typeParamNames.has(name.getText())) {
              referencedNames.add(name.getText());
            }
          }
          // Also check if the type node itself is an identifier matching a type param
          if (Node.isTypeReference(typeNode)) {
            const name = typeNode.getTypeName();
            if (Node.isIdentifier(name) && typeParamNames.has(name.getText())) {
              referencedNames.add(name.getText());
            }
          }
          continue;
        }
        // No explicit annotation — check inferred type text
        const typeText = decl.getType().getText(decl);
        for (const name of typeParamNames) {
          if (typeText === name || typeText.includes(`<${name}`) || typeText.includes(`, ${name}`)) {
            referencedNames.add(name);
          }
        }
      }
    }
  }

  if (referencedNames.size === 0) return [];

  // Filter and preserve original order from enclosingTypeParams
  const referenced = enclosingTypeParams.filter((tp) => referencedNames.has(tp.getName()));
  // Deduplicate (same name from different scopes — keep first encountered)
  const seen = new Set<string>();
  const unique = referenced.filter((tp) => {
    if (seen.has(tp.getName())) return false;
    seen.add(tp.getName());
    return true;
  });

  const parts = unique.map((tp) => tp.getText());
  return [`<${parts.join(", ")}>`];
}
