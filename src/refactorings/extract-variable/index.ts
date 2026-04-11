import { SyntaxKind, Node, ts } from "ts-morph";
import type { Project } from "ts-morph";
import type {
  EnumerateCandidate,
  PreconditionResult,
  RefactoringResult,
} from "../../core/refactoring.types.js";
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
 * Walk up the AST to find the direct child of `scopeParent` that contains `node`.
 * Returns undefined if `node` is not inside `scopeParent`.
 */
function getContainingStatementAtScope(node: Node, scopeParent: Node): Node | undefined {
  let current: Node = node;
  while (true) {
    const parent = current.getParent();
    if (!parent) return undefined;
    if (parent === scopeParent) return current;
    current = parent;
  }
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
 * Returns true if this StringLiteral (or TemplateExpression/NoSubstitutionTemplateLiteral)
 * is the module specifier in an import/export declaration.
 * Extracting such nodes would break the import/require.
 */
function isModuleSpecifier(node: Node): boolean {
  const kind = node.getKind();
  if (kind !== SyntaxKind.StringLiteral) return false;
  const parent = node.getParent();
  if (!parent) return false;
  const parentKind = parent.getKind();
  return (
    parentKind === ts.SyntaxKind.ImportDeclaration ||
    parentKind === ts.SyntaxKind.ExportDeclaration ||
    parentKind === ts.SyntaxKind.ExternalModuleReference || // require("...")
    parentKind === ts.SyntaxKind.ImportType
  );
}

/**
 * Returns true if this node is on the left-hand side of an assignment expression.
 * Extracting the LHS into a const would break the assignment (assigning to a const).
 */
function isAssignmentLHS(node: Node): boolean {
  const parent = node.getParent();
  if (!parent) return false;
  if (parent.getKind() !== ts.SyntaxKind.BinaryExpression) return false;
  const binary = parent as unknown as { getLeft?: () => Node; getOperatorToken?: () => Node };
  const op = binary.getOperatorToken?.();
  if (!op) return false;
  const opKind = op.getKind();
  const isAssign =
    opKind === ts.SyntaxKind.EqualsToken ||
    opKind === ts.SyntaxKind.PlusEqualsToken ||
    opKind === ts.SyntaxKind.MinusEqualsToken ||
    opKind === ts.SyntaxKind.AsteriskEqualsToken ||
    opKind === ts.SyntaxKind.SlashEqualsToken ||
    opKind === ts.SyntaxKind.PercentEqualsToken ||
    opKind === ts.SyntaxKind.AmpersandEqualsToken ||
    opKind === ts.SyntaxKind.BarEqualsToken ||
    opKind === ts.SyntaxKind.CaretEqualsToken ||
    opKind === ts.SyntaxKind.LessThanLessThanEqualsToken ||
    opKind === ts.SyntaxKind.GreaterThanGreaterThanEqualsToken ||
    opKind === ts.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken ||
    opKind === ts.SyntaxKind.AsteriskAsteriskEqualsToken ||
    opKind === ts.SyntaxKind.BarBarEqualsToken ||
    opKind === ts.SyntaxKind.AmpersandAmpersandEqualsToken ||
    opKind === ts.SyntaxKind.QuestionQuestionEqualsToken;
  if (!isAssign) return false;
  return binary.getLeft?.() === node;
}

/**
 * Returns true if this expression is a direct call argument that relies on contextual typing:
 *   - ArrowFunction / FunctionExpression: TypeScript infers parameter types from the call signature.
 *   - ObjectLiteralExpression / ArrayLiteralExpression: string/numeric literal fields are widened
 *     when extracted, breaking overload resolution and discriminated unions.
 * Extracting any of these breaks the contextual type supplied by the callee.
 */
function isContextuallyTypedCallArgument(node: Node): boolean {
  const kind = node.getKind();
  if (
    kind !== SyntaxKind.ArrowFunction &&
    kind !== SyntaxKind.FunctionExpression &&
    kind !== SyntaxKind.ObjectLiteralExpression &&
    kind !== SyntaxKind.ArrayLiteralExpression
  )
    return false;
  const parent = node.getParent();
  if (!parent) return false;
  const parentKind = parent.getKind();
  return parentKind === ts.SyntaxKind.CallExpression || parentKind === ts.SyntaxKind.NewExpression;
}

/**
 * Returns true if this expression is the right-hand side of an assignment expression
 * (`=` operator in a BinaryExpression) and is a contextually-typed node kind.
 * The LHS (e.g. `this.prop`, `obj["key"]`) provides contextual typing to the RHS;
 * extracting the RHS into a standalone `const` loses that context, breaking
 * implicit parameter types in arrow functions and type compatibility.
 */
function isContextuallyTypedAssignmentRHS(node: Node): boolean {
  const kind = node.getKind();
  if (
    kind !== SyntaxKind.ArrowFunction &&
    kind !== SyntaxKind.FunctionExpression &&
    kind !== SyntaxKind.ObjectLiteralExpression &&
    kind !== SyntaxKind.ArrayLiteralExpression
  )
    return false;
  const parent = node.getParent();
  if (!parent || parent.getKind() !== ts.SyntaxKind.BinaryExpression) return false;
  const binary = parent as unknown as {
    getOperatorToken?: () => Node;
    getRight?: () => Node;
  };
  const op = binary.getOperatorToken?.();
  if (!op || op.getKind() !== ts.SyntaxKind.EqualsToken) return false;
  return binary.getRight?.() === node;
}

/**
 * Returns true if this expression is the initializer of a variable declaration that has an
 * explicit type annotation. In that case the type annotation provides contextual typing
 * (e.g. `const xs: Foo[] = []` gives `[]` type `Foo[]`). Extracting it loses that context,
 * causing TypeScript to fall back to `never[]` / `{}` etc.
 */
function isInitializerOfTypedDeclaration(node: Node): boolean {
  const parent = node.getParent();
  if (!parent || parent.getKind() !== ts.SyntaxKind.VariableDeclaration) return false;
  const varDecl = parent.asKind(ts.SyntaxKind.VariableDeclaration);
  if (!varDecl) return false;
  return varDecl.getInitializer() === node && varDecl.getTypeNode() !== undefined;
}

/**
 * Returns true if this expression is used as an argument inside a decorator call.
 * Decorator overloads rely on contextual typing; extracting the argument breaks overload resolution.
 */
function isArgumentInDecorator(node: Node): boolean {
  const parent = node.getParent();
  if (!parent) return false;
  const parentKind = parent.getKind();
  if (parentKind !== ts.SyntaxKind.CallExpression && parentKind !== ts.SyntaxKind.NewExpression)
    return false;
  const grandParent = parent.getParent();
  if (!grandParent) return false;
  return grandParent.getKind() === ts.SyntaxKind.Decorator;
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
 * Returns true if this PropertyAccessExpression is used as the callee of a CallExpression.
 * Extracting `obj.method` from `obj.method(args)` into `const v = obj.method; v(args)`
 * breaks the `this` binding — the method loses its receiver.
 */
function isMethodCallCallee(node: Node): boolean {
  if (node.getKind() !== SyntaxKind.PropertyAccessExpression) return false;
  const parent = node.getParent();
  if (!parent || parent.getKind() !== ts.SyntaxKind.CallExpression) return false;
  const callExpr = parent as unknown as { getExpression?: () => Node };
  return callExpr.getExpression?.() === node;
}

/**
 * Returns true if this node is inside the consequent or alternate branch of a
 * ConditionalExpression and shares an identifier with the condition.
 * Extracting such a node above the ternary loses type narrowing provided by the condition.
 */
function isInNarrowedTernaryBranch(node: Node): boolean {
  let current: Node | undefined = node;
  while (current) {
    const parent = current.getParent();
    if (!parent) break;
    if (parent.getKind() === ts.SyntaxKind.ConditionalExpression) {
      const condExpr = parent.asKindOrThrow(ts.SyntaxKind.ConditionalExpression);
      const whenTrue = condExpr.getWhenTrue();
      const whenFalse = condExpr.getWhenFalse();
      if (current === whenTrue || current === whenFalse) {
        const condition = condExpr.getCondition();
        const condNames = collectIdentifierNames(condition);
        const nodeNames = collectIdentifierNames(node);
        for (const name of nodeNames) {
          if (condNames.has(name)) return true;
        }
      }
    }
    current = parent;
  }
  return false;
}

function collectIdentifierNames(node: Node): Set<string> {
  const names = new Set<string>();
  if (node.getKind() === SyntaxKind.Identifier) {
    names.add(node.getText());
  }
  for (const id of node.getDescendantsOfKind(SyntaxKind.Identifier)) {
    names.add(id.getText());
  }
  return names;
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
 * Returns true if `node` is inside `scopeParent` but not separated from it by a
 * function boundary (FunctionDeclaration, FunctionExpression, ArrowFunction,
 * MethodDeclaration, GetAccessor, SetAccessor, Constructor).
 * Nested `if`/`for`/`while` blocks are fine — they share the same scope.
 */
function isInsideScopeWithoutFunctionBoundary(node: Node, scopeParent: Node): boolean {
  const FUNCTION_KINDS = new Set([
    ts.SyntaxKind.FunctionDeclaration,
    ts.SyntaxKind.FunctionExpression,
    ts.SyntaxKind.ArrowFunction,
    ts.SyntaxKind.MethodDeclaration,
    ts.SyntaxKind.GetAccessor,
    ts.SyntaxKind.SetAccessor,
    ts.SyntaxKind.Constructor,
  ]);
  let current: Node | undefined = node.getParent();
  while (current) {
    if (current === scopeParent) return true;
    if (FUNCTION_KINDS.has(current.getKind())) return false;
    current = current.getParent();
  }
  return false;
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
      .filter((n) => !isInJSDocContext(n))
      .filter((n) => !isModuleSpecifier(n))
      .filter((n) => !isAssignmentLHS(n))
      .filter((n) => !isContextuallyTypedCallArgument(n))
      .filter((n) => !isContextuallyTypedAssignmentRHS(n))
      .filter((n) => !isArgumentInDecorator(n))
      .filter((n) => !isInitializerOfTypedDeclaration(n))
      .filter((n) => !isMethodCallCallee(n));

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

    // Keep only matches within the same scope (including nested blocks, but not nested
    // function bodies) that don't reference a parameter only accessible inside a nested function.
    const scopedMatches = matchingNodes.filter((node) => {
      return (
        isInsideScopeWithoutFunctionBoundary(node, scopeParent) &&
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

    // Reject if any match is inside a ternary branch that shares identifiers with
    // the condition — extracting it above the ternary loses type narrowing.
    for (const matchNode of scopedMatches) {
      if (isInNarrowedTernaryBranch(matchNode)) {
        return {
          success: false,
          filesChanged: [],
          description: `Precondition failed: '${targetText}' relies on type narrowing from a conditional expression and cannot be extracted`,
        };
      }
    }

    // Record the position of the first statement (at scopeParent level) before any AST mutations.
    // Use getContainingStatementAtScope so nested-block matches resolve to the correct top-level slot.
    const firstScopedMatch = scopedMatches[0];
    if (!firstScopedMatch) {
      return {
        success: false,
        filesChanged: [],
        description: `Expression '${targetText}' not found in file`,
      };
    }
    const firstScopedStatement = getContainingStatementAtScope(firstScopedMatch, scopeParent);
    if (!firstScopedStatement) {
      return {
        success: false,
        filesChanged: [],
        description: `Could not determine statement context for expression '${targetText}'`,
      };
    }
    const insertionPos = firstScopedStatement.getStart();

    // Reject if any matched identifier's declaration appears AFTER the insertion point
    // in the same scope (block-scoped TDZ forward reference), or is uninitialized (let/var
    // without initializer) which would be used-before-assigned after extraction.
    for (const matchNode of scopedMatches) {
      if (matchNode.getKind() !== SyntaxKind.Identifier) continue;
      const identifier = matchNode.asKind(SyntaxKind.Identifier);
      if (!identifier) continue;
      const symbol = identifier.getSymbol();
      if (!symbol) continue;
      for (const decl of symbol.getDeclarations()) {
        const declStmt = getContainingStatementAtScope(decl, scopeParent);
        if (!declStmt) continue;
        // Uninitialized let/var: `let x: T` with no initializer — extracting `x` would
        // produce `const __v = x` before x is assigned, causing "used before assigned".
        if (decl.getKind() === ts.SyntaxKind.VariableDeclaration) {
          const varDecl = decl.asKind(ts.SyntaxKind.VariableDeclaration);
          if (varDecl && varDecl.getInitializer() === undefined) {
            return {
              success: false,
              filesChanged: [],
              description: `Precondition failed: '${targetText}' is an uninitialized variable that may not be assigned at the extraction point`,
            };
          }
        }
        if (declStmt.getStart() >= insertionPos) {
          return {
            success: false,
            filesChanged: [],
            description: `Precondition failed: declaration of '${targetText}' appears after the extraction insertion point (forward reference)`,
          };
        }
      }
    }

    // When the expression contains a function call (impure), only replace the first
    // occurrence. Multiple occurrences may depend on state changes between them, so
    // caching the result in a variable would change semantics.
    const IMPURE_KINDS = new Set([
      SyntaxKind.CallExpression,
      SyntaxKind.NewExpression,
      SyntaxKind.TaggedTemplateExpression,
      SyntaxKind.AwaitExpression,
      SyntaxKind.YieldExpression,
    ]);
    const isImpure = scopedMatches.some(
      (n) =>
        IMPURE_KINDS.has(n.getKind()) ||
        n.getDescendantsOfKind(SyntaxKind.CallExpression).length > 0 ||
        n.getDescendantsOfKind(SyntaxKind.NewExpression).length > 0,
    );
    const firstMatch = scopedMatches[0];
    const matchesToReplace = isImpure && firstMatch ? [firstMatch] : scopedMatches;

    // Replace occurrences in reverse order to avoid position shifts
    const sortedMatches = [...matchesToReplace].sort((a, b) => b.getStart() - a.getStart());
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

  enumerate(project: Project): EnumerateCandidate[] {
    const candidates: EnumerateCandidate[] = [];
    for (const sf of project.getSourceFiles()) {
      const file = sf.getFilePath();
      // Collect expression-kind nodes that are not bindings, not type contexts,
      // not JSDoc, and not string-literal property names.
      // Deduplicate by text so we emit at most one candidate per (file, expression).
      const seen = new Set<string>();
      for (const node of sf.getDescendants()) {
        if (!EXPRESSION_KINDS.has(node.getKind())) continue;
        if (isBindingIdentifier(node)) continue;
        if (isInTypeContext(node)) continue;
        if (isStringLiteralPropertyName(node)) continue;
        if (isInJSDocContext(node)) continue;
        if (isModuleSpecifier(node)) continue;
        if (isAssignmentLHS(node)) continue;
        if (isContextuallyTypedCallArgument(node)) continue;
        if (isContextuallyTypedAssignmentRHS(node)) continue;
        if (isArgumentInDecorator(node)) continue;
        if (isInitializerOfTypedDeclaration(node)) continue;
        if (isMethodCallCallee(node)) continue;
        const text = node.getText().trim();
        if (!text || seen.has(text)) continue;
        seen.add(text);
        candidates.push({ file, target: text });
      }
    }
    return candidates;
  },
});
