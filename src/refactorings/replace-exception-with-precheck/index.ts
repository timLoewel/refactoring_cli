import { SyntaxKind, Node } from "ts-morph";
import type { Project } from "ts-morph";
import type {
  RefactoringDefinition,
  ParamSchema,
  PreconditionResult,
  RefactoringResult,
} from "../../engine/refactoring.types.js";

interface ReplaceExceptionWithPrecheckParams {
  file: string;
  target: string;
  condition: string;
}

const params: ParamSchema = {
  definitions: [
    { name: "file", type: "string", description: "Path to the TypeScript file", required: true },
    {
      name: "target",
      type: "string",
      description: "Name of the function to add a precheck to",
      required: true,
    },
    {
      name: "condition",
      type: "string",
      description: "Boolean expression to check before execution (e.g. 'value > 0')",
      required: true,
    },
  ],
  validate(raw: unknown): ReplaceExceptionWithPrecheckParams {
    const r = raw as Record<string, unknown>;
    if (typeof r["file"] !== "string" || r["file"].trim() === "") {
      throw new Error("param 'file' must be a non-empty string");
    }
    if (typeof r["target"] !== "string" || r["target"].trim() === "") {
      throw new Error("param 'target' must be a non-empty string");
    }
    if (typeof r["condition"] !== "string" || r["condition"].trim() === "") {
      throw new Error("param 'condition' must be a non-empty string");
    }
    return {
      file: r["file"] as string,
      target: r["target"] as string,
      condition: r["condition"] as string,
    };
  },
};

function preconditions(
  project: Project,
  p: ReplaceExceptionWithPrecheckParams,
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

  const throwStatements = body.getDescendantsOfKind(SyntaxKind.ThrowStatement);
  if (throwStatements.length === 0) {
    errors.push(`Function '${p.target}' contains no throw statements to replace`);
  }

  return { ok: errors.length === 0, errors };
}

function apply(project: Project, p: ReplaceExceptionWithPrecheckParams): RefactoringResult {
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

  // Find throw statements that are direct children of if-statements (guard clauses)
  const throwStatements = body.getDescendantsOfKind(SyntaxKind.ThrowStatement);
  if (throwStatements.length === 0) {
    return {
      success: false,
      filesChanged: [],
      description: `No throw statements found in '${p.target}'`,
      diff: [],
    };
  }

  // Prepend a guard precheck at the start of the function body
  const returnTypeNode = fn.getReturnTypeNode();
  const returnType = returnTypeNode ? returnTypeNode.getText() : "void";
  const isVoid = returnType === "void" || returnType === "undefined";

  const precheckStatement = isVoid
    ? `if (!(${p.condition})) { return; }`
    : `if (!(${p.condition})) { return; }`;

  fn.addStatements(precheckStatement);

  // Move the precheck to the beginning of the body
  if (Node.isBlock(body)) {
    const statements = body.getStatements();
    const lastStatement = statements[statements.length - 1];
    if (lastStatement) {
      const precheckText = lastStatement.getText();
      lastStatement.remove();
      body.insertStatements(0, precheckText);
    }
  }

  return {
    success: true,
    filesChanged: [p.file],
    description: `Added precheck '${p.condition}' to function '${p.target}' to avoid exception path`,
    diff: [],
  };
}

export const replaceExceptionWithPrecheck: RefactoringDefinition = {
  name: "Replace Exception With Precheck",
  kebabName: "replace-exception-with-precheck",
  description:
    "Adds a precondition guard at the start of a function so that callers avoid the exceptional path.",
  tier: 2,
  params,
  preconditions: (project: Project, raw: unknown): PreconditionResult =>
    preconditions(project, params.validate(raw) as ReplaceExceptionWithPrecheckParams),
  apply: (project: Project, raw: unknown): RefactoringResult =>
    apply(project, params.validate(raw) as ReplaceExceptionWithPrecheckParams),
};
