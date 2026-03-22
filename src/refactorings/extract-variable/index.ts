import { SyntaxKind, Node } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../engine/refactoring.types.js";
import { defineRefactoring, param, resolve } from "../../engine/refactoring-builder.js";
import type { SourceFileContext } from "../../engine/refactoring-builder.js";

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

    // Collect all descendant nodes matching the target expression text
    const matchingNodes = sf
      .getDescendants()
      .filter((n) => EXPRESSION_KINDS.has(n.getKind()) && n.getText().trim() === targetText);

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

    // Keep only matches within the same scope
    const scopedMatches = matchingNodes.filter((node) => {
      const stmt = getContainingStatement(node);
      return stmt !== undefined && stmt.getParent() === scopeParent;
    });

    // Record the position of the first statement before any AST mutations
    const insertionPos = firstStatement.getPos();

    // Replace all occurrences in reverse order to avoid position shifts
    const sortedMatches = [...scopedMatches].sort((a, b) => b.getStart() - a.getStart());
    for (const node of sortedMatches) {
      node.replaceWithText(varName);
    }

    // After replacements, find the statement at (or just after) the recorded position
    const newDeclaration = `const ${varName} = ${targetText};`;

    if (Node.isBlock(scopeParent)) {
      const statements = scopeParent.getStatements();
      let insertIndex = statements.findIndex((s) => s.getPos() >= insertionPos);
      if (insertIndex === -1) insertIndex = statements.length;
      scopeParent.insertStatements(insertIndex, newDeclaration);
    } else if (Node.isSourceFile(scopeParent)) {
      const statements = scopeParent.getStatements();
      let insertIndex = statements.findIndex((s) => s.getPos() >= insertionPos);
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
