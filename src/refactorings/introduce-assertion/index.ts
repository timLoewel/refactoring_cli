import { Node, SyntaxKind } from "ts-morph";
import type { Project } from "ts-morph";
import type {
  RefactoringDefinition,
  ParamSchema,
  PreconditionResult,
  RefactoringResult,
} from "../../engine/refactoring.types.js";

export interface IntroduceAssertionParams {
  file: string;
  target: string;
  condition: string;
  message?: string;
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
      description: "Name of the function to add the assertion to",
      required: true,
    },
    {
      name: "condition",
      type: "string",
      description: "The boolean condition expression that must be true (e.g. 'n >= 0')",
      required: true,
    },
    {
      name: "message",
      type: "string",
      description: "Optional error message thrown when the assertion fails",
      required: false,
    },
  ],
  validate(raw: unknown): IntroduceAssertionParams {
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
    const message =
      r["message"] !== undefined && r["message"] !== null ? String(r["message"]) : undefined;
    return {
      file: r["file"] as string,
      target: r["target"] as string,
      condition: r["condition"] as string,
      message,
    };
  },
};

function preconditions(project: Project, p: IntroduceAssertionParams): PreconditionResult {
  const errors: string[] = [];

  const sf = project.getSourceFile(p.file);
  if (!sf) {
    errors.push(`File not found in project: ${p.file}`);
    return { ok: false, errors };
  }

  const funcDecl = sf
    .getDescendantsOfKind(SyntaxKind.FunctionDeclaration)
    .find((d) => d.getName() === p.target);

  if (!funcDecl) {
    errors.push(`Function '${p.target}' not found in file: ${p.file}`);
    return { ok: false, errors };
  }

  const body = funcDecl.getBody();
  if (!body) {
    errors.push(`Function '${p.target}' has no body`);
  }

  return { ok: errors.length === 0, errors };
}

function buildAssertionStatement(condition: string, message: string | undefined): string {
  const errorMsg =
    message !== undefined && message.trim() !== ""
      ? JSON.stringify(message)
      : JSON.stringify(`Assertion failed: ${condition}`);
  return `if (!(${condition})) { throw new Error(${errorMsg}); }`;
}

function apply(project: Project, p: IntroduceAssertionParams): RefactoringResult {
  const sf = project.getSourceFile(p.file);
  if (!sf) {
    return {
      success: false,
      filesChanged: [],
      description: `File not found: ${p.file}`,
    };
  }

  const funcDecl = sf
    .getDescendantsOfKind(SyntaxKind.FunctionDeclaration)
    .find((d) => d.getName() === p.target);

  if (!funcDecl) {
    return {
      success: false,
      filesChanged: [],
      description: `Function '${p.target}' not found`,
    };
  }

  const body = funcDecl.getBody();
  if (!body || !Node.isBlock(body)) {
    return {
      success: false,
      filesChanged: [],
      description: `Function '${p.target}' has no block body`,
    };
  }

  const assertionStatement = buildAssertionStatement(p.condition, p.message);
  body.insertStatements(0, assertionStatement);

  return {
    success: true,
    filesChanged: [p.file],
    description: `Inserted assertion '${p.condition}' at the start of function '${p.target}'`,
  };
}

export const introduceAssertion: RefactoringDefinition = {
  name: "Introduce Assertion",
  kebabName: "introduce-assertion",
  description:
    "Inserts an assertion guard at the beginning of a function to make its preconditions explicit.",
  tier: 1,
  params,
  preconditions: (project: Project, raw: unknown): PreconditionResult =>
    preconditions(project, params.validate(raw) as IntroduceAssertionParams),
  apply: (project: Project, raw: unknown): RefactoringResult =>
    apply(project, params.validate(raw) as IntroduceAssertionParams),
};
