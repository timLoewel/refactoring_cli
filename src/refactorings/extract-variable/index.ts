import { SyntaxKind, Node, ts } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { defineRefactoring, param, resolve } from "../../core/refactoring-builder.js";
import type { SourceFileContext } from "../../core/refactoring.types.js";

/**
 * Walk up the AST to find the direct child of a Block or SourceFile —
 * i.e. the statement that contains the given node.
 */
function getContainingStatement(node: Node): Node | undefined {
  let current: Node = node;
  while (current.getParent() !== undefined) {
    const parent = current.getParent();
    if (!parent) return undefined;
    if (Node.isBlock(parent) || Node.isSourceFile(parent)) {
      return current;
    }
    current = parent;
  }
  return undefined;
}

/**
 * Returns true if this node is in a type-annotation context (TypeReference, ArrayType, etc.)
 * rather than a value/expression context. Such nodes should not be extracted as variables.
 */
function isInTypeContext(node: Node): boolean {
  let current: Node | undefined = node.getParent();
  while (current) {
    if (Node.isTypeNode(current)) return true;
    // Stop searching once we reach an expression or statement boundary
    if (Node.isExpression(current) || Node.isStatement(current)) return false;
    current = current.getParent();
  }
  return false;
}

/**
 * Returns true if this node is inside a JSDoc comment (JSDocLink, JSDocText, etc.).
 * JSDoc nodes are not value expressions and should not be extracted.
 */
function isInJSDocContext(node: Node): boolean {
  let current: Node | undefined = node.getParent();
  while (current) {
    const kind = current.getKind();
    if (
      kind === ts.SyntaxKind.JSDoc ||
      kind === ts.SyntaxKind.JSDocComment ||
      kind === ts.SyntaxKind.JSDocLink ||
      kind === ts.SyntaxKind.JSDocLinkCode ||
      kind === ts.SyntaxKind.JSDocLinkPlain ||
      kind === ts.SyntaxKind.JSDocTag ||
      kind === ts.SyntaxKind.JSDocNamepathType ||
      kind === ts.SyntaxKind.JSDocText
    ) {
      return true;
    }
    if (Node.isExpression(current) || Node.isStatement(current)) return false;
    current = current.getParent();
  }
  return false;
}

/**
 * Returns true if this StringLiteral node is used as a property name in a declaration
 * (class property, method, index signature, etc.) rather than as a value expression.
 */
function isStringLiteralPropertyName(node: Node): boolean {
  if (node.getKind() !== SyntaxKind.StringLiteral) return false;
  const parent = node.getParent();
  if (!parent) return false;
  const parentKind = parent.getKind();
  switch (parentKind) {
    case ts.SyntaxKind.PropertyDeclaration:
    case ts.SyntaxKind.MethodDeclaration:
    case ts.SyntaxKind.GetAccessor:
    case ts.SyntaxKind.SetAccessor:
    case ts.SyntaxKind.PropertySignature:
    case ts.SyntaxKind.MethodSignature:
    case ts.SyntaxKind.PropertyAssignment:
    case ts.SyntaxKind.ShorthandPropertyAssignment: {
      const named = parent as unknown as { getNameNode?: () => Node | undefined };
      return named.getNameNode?.() === node;
    }
    default:
      return false;
  }
}

/**
 * Expression node kinds that can be matched as a target expression.
 */
const EXPRESSION_KINDS = new Set<SyntaxKind>([
  SyntaxKind.BinaryExpression,
  SyntaxKind.CallExpression,
  SyntaxKind.PropertyAccessExpression,
  SyntaxKind.ElementAccessExpression,
  SyntaxKind.ParenthesizedExpression,
  SyntaxKind.NumericLiteral,
  SyntaxKind.StringLiteral,
  SyntaxKind.Identifier,
  SyntaxKind.PrefixUnaryExpression,
  SyntaxKind.PostfixUnaryExpression,
  SyntaxKind.ConditionalExpression,
  SyntaxKind.TemplateExpression,
  SyntaxKind.ArrowFunction,
  SyntaxKind.ObjectLiteralExpression,
  SyntaxKind.ArrayLiteralExpression,
  SyntaxKind.NewExpression,
]);

/**
 * Returns true if this identifier is the name of a declaration (class, function,
 * variable, parameter, method, etc.) rather than a reference expression.
 * Replacing a binding identifier breaks the declaration.
 */
function isBindingIdentifier(node: Node): boolean {
  if (node.getKind() !== SyntaxKind.Identifier) return false;
  const parent = node.getParent();
  if (!parent) return false;
  const parentKind = parent.getKind();

  // Use ts-morph's getNameNode() for all named declarations — works correctly
  // regardless of decorators, modifiers, or accessor keywords.
  switch (parentKind) {
    case ts.SyntaxKind.ClassDeclaration:
    case ts.SyntaxKind.ClassExpression:
    case ts.SyntaxKind.FunctionDeclaration:
    case ts.SyntaxKind.FunctionExpression:
    case ts.SyntaxKind.MethodDeclaration:
    case ts.SyntaxKind.PropertyDeclaration:
    case ts.SyntaxKind.GetAccessor:
    case ts.SyntaxKind.SetAccessor:
    case ts.SyntaxKind.Parameter: {
      const named = parent as unknown as { getNameNode?: () => Node | undefined };
      return named.getNameNode?.() === node;
    }
    case ts.SyntaxKind.VariableDeclaration: {
      const varDecl = parent.asKindOrThrow(ts.SyntaxKind.VariableDeclaration);
      return varDecl.getNameNode() === node;
    }
    // Shorthand property assignment `{ foo }` and destructuring `const { foo } = ...`
    case ts.SyntaxKind.ShorthandPropertyAssignment:
    case ts.SyntaxKind.BindingElement:
      return true;
    // Property access name: `obj.foo` — `foo` after the dot is a property name, not a reference
    case ts.SyntaxKind.PropertyAccessExpression: {
      const pae = parent as unknown as { getNameNode?: () => Node | undefined };
      return pae.getNameNode?.() === node;
    }
    // Object literal key: `{ foo: 1 }` — `foo` is a property key, not a reference
    case ts.SyntaxKind.PropertyAssignment: {
      const pa = parent as unknown as { getNameNode?: () => Node | undefined };
      return pa.getNameNode?.() === node;
    }
    // Type literal property name: `{ readonly primary: "primary" }` — type-level binding
    case ts.SyntaxKind.PropertySignature: {
      const ps = parent as unknown as { getNameNode?: () => Node | undefined };
      return ps.getNameNode?.() === node;
    }
    // Enum member name: `enum Foo { Bar = 1 }` — `Bar` is a binding, not a reference
    case ts.SyntaxKind.EnumMember: {
      const em = parent as unknown as { getNameNode?: () => Node | undefined };
      return em.getNameNode?.() === node;
    }
    default:
      return false;
  }
}

/**
 * Returns true if this identifier node references a symbol (parameter or local variable)
 * that is only accessible inside a nested function/arrow function within scopeParent —
 * meaning extracting it to scopeParent would leave the new `const` referencing an undefined name.
 */
function referencesParameterNotAccessibleAtScope(node: Node, scopeParent: Node): boolean {
  if (node.getKind() !== SyntaxKind.Identifier) return false;
  const identifier = node.asKind(SyntaxKind.Identifier);
  if (!identifier) return false;

  const symbol = identifier.getSymbol();
  if (!symbol) return false;

  for (const decl of symbol.getDeclarations()) {
    if (decl.getKind() !== ts.SyntaxKind.Parameter) continue;
    // Walk up from the parameter declaration to see if scopeParent is an ancestor.
    // If it is, the parameter is declared inside a nested scope under scopeParent,
    // so it's not accessible at scopeParent level.
    let ancestor: Node | undefined = decl.getParent();
    while (ancestor) {
      if (ancestor === scopeParent) return true;
      ancestor = ancestor.getParent();
    }
  }
  return false;
}

export const extractVariable = defineRefactoring<SourceFileContext>({
  name: "Extract Variable",
  kebabName: "extract-variable",
  tier: 1,
  description:
    "Extracts a repeated expression into a named const variable and replaces all occurrences in the same scope.",
  params: [
    param.file(),
    param.string("target", "The expression text to extract into a variable"),
    param.identifier("name", "The name for the new variable"),
  ],
  resolve: (project, params) => resolve.sourceFile(project, params as { file: string }),
  preconditions(ctx: SourceFileContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const text = ctx.sourceFile.getFullText();
    const target = params["target"] as string;
    if (!text.includes(target)) {
      errors.push(`Expression '${target}' not found in file`);
    }
    return { ok: errors.length === 0, errors };
  },
  apply(ctx: SourceFileContext, params: Record<string, unknown>): RefactoringResult {
    const sf = ctx.sourceFile;
    const file = params["file"] as string;
    const targetText = (params["target"] as string).trim();
    const varName = (params["name"] as string).trim();

    // Collect all descendant nodes matching the target expression text.
    // Exclude binding identifiers (declaration names) — replacing them breaks the declaration.
    // Also exclude nodes in type contexts and string literal property names.
    const matchingNodes = sf
      .getDescendants()
      .filter((n) => EXPRESSION_KINDS.has(n.getKind()) && n.getText().trim() === targetText)
      .filter((n) => !isBindingIdentifier(n))
      .filter((n) => !isInTypeContext(n))
      .filter((n) => !isStringLiteralPropertyName(n))
      .filter((n) => !isInJSDocContext(n));

    if (matchingNodes.length === 0) {
      return {
        success: false,
        filesChanged: [],
        description: `Expression '${targetText}' not found in file`,
      };
    }

    // Determine scope from the first match
    const firstMatchNode = matchingNodes[0];
    if (!firstMatchNode) {
      return {
        success: false,
        filesChanged: [],
        description: `Expression '${targetText}' not found in file`,
      };
    }
    const firstStatement = getContainingStatement(firstMatchNode);
    if (!firstStatement) {
      return {
        success: false,
        filesChanged: [],
        description: `Could not determine statement context for expression '${targetText}'`,
      };
    }

    const scopeParent = firstStatement.getParent();
    if (!scopeParent) {
      return {
        success: false,
        filesChanged: [],
        description: "Could not find parent scope for insertion",
      };
    }

    // Keep only matches within the same scope that don't reference a parameter
    // only accessible inside a nested function (would be undefined at the extraction point).
    const scopedMatches = matchingNodes.filter((node) => {
      const stmt = getContainingStatement(node);
      return (
        stmt !== undefined &&
        stmt.getParent() === scopeParent &&
        !referencesParameterNotAccessibleAtScope(node, scopeParent)
      );
    });

    if (scopedMatches.length === 0) {
      return {
        success: false,
        filesChanged: [],
        description: `Precondition failed: '${targetText}' only occurs as a reference to a locally-scoped parameter not accessible at the extraction scope`,
      };
    }

    // Record the position of the first statement before any AST mutations
    const firstScopedMatch = scopedMatches[0];
    if (!firstScopedMatch) {
      return {
        success: false,
        filesChanged: [],
        description: `Expression '${targetText}' not found in file`,
      };
    }
    const firstScopedStatement = getContainingStatement(firstScopedMatch);
    if (!firstScopedStatement) {
      return {
        success: false,
        filesChanged: [],
        description: `Could not determine statement context for expression '${targetText}'`,
      };
    }
    const insertionPos = firstScopedStatement.getStart();

    // Reject if any matched identifier's declaration appears AFTER the insertion point
    // in the same scope (block-scoped TDZ forward reference).
    for (const matchNode of scopedMatches) {
      if (matchNode.getKind() !== SyntaxKind.Identifier) continue;
      const identifier = matchNode.asKind(SyntaxKind.Identifier);
      if (!identifier) continue;
      const symbol = identifier.getSymbol();
      if (!symbol) continue;
      for (const decl of symbol.getDeclarations()) {
        const declStmt = getContainingStatement(decl);
        if (!declStmt || declStmt.getParent() !== scopeParent) continue;
        if (declStmt.getStart() >= insertionPos) {
          return {
            success: false,
            filesChanged: [],
            description: `Precondition failed: declaration of '${targetText}' appears after the extraction insertion point (forward reference)`,
          };
        }
      }
    }

    // Replace all occurrences in reverse order to avoid position shifts
    const sortedMatches = [...scopedMatches].sort((a, b) => b.getStart() - a.getStart());
    for (const node of sortedMatches) {
      node.replaceWithText(varName);
    }

    // After replacements, find the statement at (or just after) the recorded position
    const newDeclaration = `const ${varName} = ${targetText};`;

    if (Node.isBlock(scopeParent)) {
      // insertStatements counts comment nodes (SingleLineCommentTrivia etc.) as entries,
      // so we must use getStatementsWithComments() to get indices that match.
      const statements = scopeParent.getStatementsWithComments();
      let insertIndex = statements.findIndex((s) => s.getStart() >= insertionPos);
      if (insertIndex === -1) insertIndex = statements.length;
      scopeParent.insertStatements(insertIndex, newDeclaration);
    } else if (Node.isSourceFile(scopeParent)) {
      const statements = scopeParent.getStatementsWithComments();
      let insertIndex = statements.findIndex((s) => s.getStart() >= insertionPos);
      if (insertIndex === -1) insertIndex = statements.length;
      scopeParent.insertStatements(insertIndex, newDeclaration);
    } else {
      return {
        success: false,
        filesChanged: [],
        description: "Expression is not inside a block or source file",
      };
    }

    return {
      success: true,
      filesChanged: [file],
      description: `Extracted '${targetText}' into variable '${varName}'`,
    };
  },
});
