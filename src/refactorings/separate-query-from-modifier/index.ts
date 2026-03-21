import { SyntaxKind, Node } from "ts-morph";
import type { Project, Statement } from "ts-morph";
import type {
  RefactoringDefinition,
  ParamSchema,
  PreconditionResult,
  RefactoringResult,
} from "../../engine/refactoring.types.js";

interface SeparateQueryFromModifierParams {
  file: string;
  target: string;
}

const params: ParamSchema = {
  definitions: [
    { name: "file", type: "string", description: "Path to the TypeScript file", required: true },
    {
      name: "target",
      type: "string",
      description: "Name of the function to split into query and modifier",
      required: true,
    },
  ],
  validate(raw: unknown): SeparateQueryFromModifierParams {
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

function preconditions(project: Project, p: SeparateQueryFromModifierParams): PreconditionResult {
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

  // Must return something (query part) and have side effects (modifier part)
  const returnStmts = body.getDescendantsOfKind(SyntaxKind.ReturnStatement);
  if (returnStmts.length === 0) {
    errors.push(`Function '${p.target}' has no return statement; cannot separate query`);
  }

  const returnTypeNode = fn.getReturnTypeNode();
  const returnType = returnTypeNode ? returnTypeNode.getText() : null;
  if (returnType === "void") {
    errors.push(`Function '${p.target}' returns void; it is already a pure modifier`);
  }

  return { ok: errors.length === 0, errors };
}

function apply(project: Project, p: SeparateQueryFromModifierParams): RefactoringResult {
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
  if (!body) {
    return {
      success: false,
      filesChanged: [],
      description: `Function '${p.target}' has no body`,
      diff: [],
    };
  }

  if (!Node.isBlock(body)) {
    return {
      success: false,
      filesChanged: [],
      description: `Function '${p.target}' body is not a block`,
      diff: [],
    };
  }
  const statements = body.getStatements();
  const returnTypeNode = fn.getReturnTypeNode();
  const returnType = returnTypeNode ? returnTypeNode.getText() : "unknown";

  const fnParams = fn.getParameters();
  const paramList = fnParams
    .map((param) => {
      const typeNode = param.getTypeNode();
      return `${param.getName()}${param.hasQuestionToken() ? "?" : ""}: ${typeNode ? typeNode.getText() : "unknown"}`;
    })
    .join(", ");
  const paramNames = fnParams.map((p2) => p2.getName()).join(", ");

  // Separate return statement from side-effect statements
  const returnStmts = statements.filter(
    (s: Statement) => s.getKind() === SyntaxKind.ReturnStatement,
  );
  const sideEffectStmts = statements.filter(
    (s: Statement) => s.getKind() !== SyntaxKind.ReturnStatement,
  );

  const queryName = `get${p.target.charAt(0).toUpperCase()}${p.target.slice(1)}`;
  const modifierName = `set${p.target.charAt(0).toUpperCase()}${p.target.slice(1)}`;

  // Build query function (returns the value, no side effects)
  const returnStmt = returnStmts[0];
  if (!returnStmt) {
    return {
      success: false,
      filesChanged: [],
      description: `Function '${p.target}' has no return statement`,
      diff: [],
    };
  }
  const returnExpr =
    returnStmt.asKind(SyntaxKind.ReturnStatement)?.getExpression()?.getText() ?? "undefined";

  const queryBody = `  return ${returnExpr};`;
  const queryFn = `function ${queryName}(${paramList}): ${returnType} {\n${queryBody}\n}`;

  // Build modifier function (side effects only, returns void)
  const modifierBody = sideEffectStmts.map((s: Statement) => `  ${s.getText()}`).join("\n");
  const modifierFn = `function ${modifierName}(${paramList}): void {\n${modifierBody}\n}`;

  // Replace the original function body to call both
  const newBody = `{\n  ${modifierName}(${paramNames});\n  return ${queryName}(${paramNames});\n}`;

  body.replaceWithText(newBody);

  // Append the two new functions
  sf.addStatements(`\n${queryFn}\n\n${modifierFn}`);

  return {
    success: true,
    filesChanged: [p.file],
    description: `Split '${p.target}' into query '${queryName}' and modifier '${modifierName}'`,
    diff: [],
  };
}

export const separateQueryFromModifier: RefactoringDefinition = {
  name: "Separate Query From Modifier",
  kebabName: "separate-query-from-modifier",
  description:
    "Splits a function that both returns a value and has side effects into a pure query function and a void modifier function.",
  tier: 2,
  params,
  preconditions: (project: Project, raw: unknown): PreconditionResult =>
    preconditions(project, params.validate(raw) as SeparateQueryFromModifierParams),
  apply: (project: Project, raw: unknown): RefactoringResult =>
    apply(project, params.validate(raw) as SeparateQueryFromModifierParams),
};
