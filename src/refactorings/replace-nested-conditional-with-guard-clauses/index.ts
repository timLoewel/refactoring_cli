import { SyntaxKind, Node } from "ts-morph";
import type { Project } from "ts-morph";
import type {
  RefactoringDefinition,
  ParamSchema,
  PreconditionResult,
  RefactoringResult,
} from "../../engine/refactoring.types.js";

interface ReplaceNestedConditionalWithGuardClausesParams {
  file: string;
  target: string;
}

const params: ParamSchema = {
  definitions: [
    { name: "file", type: "string", description: "Path to the TypeScript file", required: true },
    {
      name: "target",
      type: "string",
      description: "Name of the function to flatten nested conditionals in",
      required: true,
    },
  ],
  validate(raw: unknown): ReplaceNestedConditionalWithGuardClausesParams {
    const r = raw as Record<string, unknown>;
    if (typeof r["file"] !== "string" || r["file"].trim() === "") {
      throw new Error("param 'file' must be a non-empty string");
    }
    if (typeof r["target"] !== "string" || r["target"].trim() === "") {
      throw new Error("param 'target' must be a non-empty string");
    }
    return { file: r["file"] as string, target: r["target"] as string };
  },
};

function preconditions(
  project: Project,
  p: ReplaceNestedConditionalWithGuardClausesParams,
): PreconditionResult {
  const errors: string[] = [];

  const sf = project.getSourceFile(p.file);
  if (!sf) {
    errors.push(`File not found in project: ${p.file}`);
    return { ok: false, errors };
  }

  const fn = sf
    .getDescendantsOfKind(SyntaxKind.FunctionDeclaration)
    .find((f) => f.getName() === p.target);

  if (!fn) {
    errors.push(`Function '${p.target}' not found in file: ${p.file}`);
    return { ok: false, errors };
  }

  const body = fn.getBody();
  if (!body) {
    errors.push(`Function '${p.target}' has no body`);
    return { ok: false, errors };
  }

  const ifStatements = body.getDescendantsOfKind(SyntaxKind.IfStatement);
  if (ifStatements.length === 0) {
    errors.push(`Function '${p.target}' has no if statements to convert to guard clauses`);
  }

  return { ok: errors.length === 0, errors };
}

function extractBlockText(node: Node): string {
  if (node.getKind() === SyntaxKind.Block) {
    const children = node.getChildSyntaxList()?.getChildren();
    if (children) {
      return children.map((s: Node) => s.getText()).join("\n");
    }
  }
  return node.getText();
}

interface GuardClauseResult {
  guardClauses: string[];
  mainBody: string;
  otherStatements: string[];
}

function processStatements(statements: Node[]): GuardClauseResult {
  const guardClauses: string[] = [];
  const otherStatements: string[] = [];
  let mainBody = "";

  for (const stmt of statements) {
    const ifStmt = stmt.asKind(SyntaxKind.IfStatement);
    if (!ifStmt) {
      otherStatements.push(stmt.getText());
      continue;
    }

    const elseClause = ifStmt.getElseStatement();
    if (!elseClause) {
      otherStatements.push(stmt.getText());
      continue;
    }

    const condition = ifStmt.getExpression().getText();
    const thenBlock = ifStmt.getThenStatement();
    const thenReturns = thenBlock.getDescendantsOfKind(SyntaxKind.ReturnStatement);

    if (thenReturns.length > 0) {
      guardClauses.push(`if (${condition}) {\n  ${extractBlockText(thenBlock)}\n}`);
      mainBody = extractBlockText(elseClause);
    } else {
      const elseReturns = elseClause.getDescendantsOfKind(SyntaxKind.ReturnStatement);
      const firstElseReturn = elseReturns[0];
      const earlyReturnExpr = firstElseReturn
        ? (firstElseReturn.getExpression()?.getText() ?? "undefined")
        : "undefined";
      guardClauses.push(`if (!(${condition})) return ${earlyReturnExpr};`);
      mainBody = extractBlockText(thenBlock);
    }
  }

  return { guardClauses, mainBody, otherStatements };
}

function apply(
  project: Project,
  p: ReplaceNestedConditionalWithGuardClausesParams,
): RefactoringResult {
  const sf = project.getSourceFile(p.file);
  if (!sf) {
    return { success: false, filesChanged: [], description: `File not found: ${p.file}`, diff: [] };
  }

  const fn = sf
    .getDescendantsOfKind(SyntaxKind.FunctionDeclaration)
    .find((f) => f.getName() === p.target);
  if (!fn) {
    return {
      success: false,
      filesChanged: [],
      description: `Function '${p.target}' not found`,
      diff: [],
    };
  }

  const body = fn.getBody();
  if (!body || !Node.isBlock(body)) {
    return {
      success: false,
      filesChanged: [],
      description: `Function '${p.target}' has no block body`,
      diff: [],
    };
  }

  const { guardClauses, mainBody, otherStatements } = processStatements(body.getStatements());

  const allLines = [...otherStatements.filter((s) => !s.includes("if (")), ...guardClauses];
  if (mainBody) allLines.push(mainBody);

  const newBodyText = allLines.map((s) => `  ${s}`).join("\n");
  body.replaceWithText(`{\n${newBodyText}\n}`);

  return {
    success: true,
    filesChanged: [p.file],
    description: `Replaced nested conditionals in '${p.target}' with guard clauses`,
    diff: [],
  };
}

export const replaceNestedConditionalWithGuardClauses: RefactoringDefinition = {
  name: "Replace Nested Conditional With Guard Clauses",
  kebabName: "replace-nested-conditional-with-guard-clauses",
  description:
    "Flattens deeply nested if-else conditionals in a function into early-return guard clauses.",
  tier: 2,
  params,
  preconditions: (project: Project, raw: unknown): PreconditionResult =>
    preconditions(project, params.validate(raw) as ReplaceNestedConditionalWithGuardClausesParams),
  apply: (project: Project, raw: unknown): RefactoringResult =>
    apply(project, params.validate(raw) as ReplaceNestedConditionalWithGuardClausesParams),
};
