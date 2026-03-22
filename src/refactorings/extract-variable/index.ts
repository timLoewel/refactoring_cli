import type { Project } from "ts-morph";
import { SyntaxKind, Node } from "ts-morph";
import type {
  RefactoringDefinition,
  ParamSchema,
  PreconditionResult,
  RefactoringResult,
} from "../../engine/refactoring.types.js";

export interface ExtractVariableParams {
  file: string;
  target: string;
  name: string;
}

const params: ParamSchema = {
  definitions: [
    {
      name: "file",
      type: "string",
      description: "Path to the TypeScript file",
      required: true,
    },
    {
      name: "target",
      type: "string",
      description: "The expression text to extract into a variable",
      required: true,
    },
    {
      name: "name",
      type: "string",
      description: "The name for the new variable",
      required: true,
    },
  ],
  validate(raw: unknown): ExtractVariableParams {
    const r = raw as Record<string, unknown>;
    if (typeof r["file"] !== "string" || r["file"].trim() === "") {
      throw new Error("param 'file' must be a non-empty string");
    }
    if (typeof r["target"] !== "string" || r["target"].trim() === "") {
      throw new Error("param 'target' must be a non-empty string");
    }
    if (typeof r["name"] !== "string" || r["name"].trim() === "") {
      throw new Error("param 'name' must be a non-empty string");
    }
    return {
      file: r["file"] as string,
      target: r["target"] as string,
      name: r["name"] as string,
    };
  },
};

function preconditions(project: Project, p: ExtractVariableParams): PreconditionResult {
  const errors: string[] = [];

  const sf = project.getSourceFile(p.file);
  if (!sf) {
    errors.push(`File not found in project: ${p.file}`);
    return { ok: false, errors };
  }

  const text = sf.getFullText();
  if (!text.includes(p.target)) {
    errors.push(`Expression '${p.target}' not found in file: ${p.file}`);
  }

  if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(p.name)) {
    errors.push(`'${p.name}' is not a valid identifier`);
  }

  return { ok: errors.length === 0, errors };
}

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

function apply(project: Project, p: ExtractVariableParams): RefactoringResult {
  const sf = project.getSourceFile(p.file);
  if (!sf) {
    return {
      success: false,
      filesChanged: [],
      description: `File not found: ${p.file}`,
    };
  }

  const targetText = p.target.trim();
  const varName = p.name.trim();

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
    filesChanged: [p.file],
    description: `Extracted '${targetText}' into variable '${varName}'`,
  };
}

export const extractVariable: RefactoringDefinition = {
  name: "Extract Variable",
  kebabName: "extract-variable",
  description:
    "Extracts a repeated expression into a named const variable and replaces all occurrences in the same scope.",
  tier: 1,
  params,
  preconditions: (project: Project, raw: unknown): PreconditionResult =>
    preconditions(project, params.validate(raw) as ExtractVariableParams),
  apply: (project: Project, raw: unknown): RefactoringResult =>
    apply(project, params.validate(raw) as ExtractVariableParams),
};
