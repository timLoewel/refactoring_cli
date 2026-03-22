import { SyntaxKind } from "ts-morph";
import type { Project } from "ts-morph";
import type {
  RefactoringDefinition,
  ParamSchema,
  PreconditionResult,
  RefactoringResult,
} from "../../engine/refactoring.types.js";

interface ReplaceErrorCodeWithExceptionParams {
  file: string;
  target: string;
}

const params: ParamSchema = {
  definitions: [
    { name: "file", type: "string", description: "Path to the TypeScript file", required: true },
    {
      name: "target",
      type: "string",
      description:
        "Name of the function whose error code returns should be replaced with exceptions",
      required: true,
    },
  ],
  validate(raw: unknown): ReplaceErrorCodeWithExceptionParams {
    const r = raw as Record<string, unknown>;
    if (typeof r["file"] !== "string" || r["file"].trim() === "") {
      throw new Error("param 'file' must be a non-empty string");
    }
    if (typeof r["target"] !== "string" || r["target"].trim() === "") {
      throw new Error("param 'target' must be a non-empty string");
    }
    return {
      file: r["file"] as string,
      target: r["target"] as string,
    };
  },
};

function preconditions(
  project: Project,
  p: ReplaceErrorCodeWithExceptionParams,
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

  // Check that the function returns a negative numeric literal (error code pattern)
  const body = fn.getBody();
  if (!body) {
    errors.push(`Function '${p.target}' has no body`);
    return { ok: false, errors };
  }

  const returnStatements = body.getDescendantsOfKind(SyntaxKind.ReturnStatement);
  const hasNegativeReturn = returnStatements.some((ret) => {
    const expr = ret.getExpression();
    if (!expr) return false;
    const text = expr.getText().trim();
    return /^-\d+$/.test(text);
  });

  if (!hasNegativeReturn) {
    errors.push(
      `Function '${p.target}' does not contain negative numeric return statements (error codes)`,
    );
  }

  return { ok: errors.length === 0, errors };
}

function apply(project: Project, p: ReplaceErrorCodeWithExceptionParams): RefactoringResult {
  const sf = project.getSourceFile(p.file);
  if (!sf) {
    return { success: false, filesChanged: [], description: `File not found: ${p.file}` };
  }

  const fn = sf
    .getDescendantsOfKind(SyntaxKind.FunctionDeclaration)
    .find((f) => f.getName() === p.target);
  if (!fn) {
    return {
      success: false,
      filesChanged: [],
      description: `Function '${p.target}' not found`,
    };
  }

  const body = fn.getBody();
  if (!body) {
    return {
      success: false,
      filesChanged: [],
      description: `Function '${p.target}' has no body`,
    };
  }

  const returnStatements = body.getDescendantsOfKind(SyntaxKind.ReturnStatement);
  const sorted = [...returnStatements].sort((a, b) => b.getStart() - a.getStart());

  let replaced = 0;
  for (const ret of sorted) {
    const expr = ret.getExpression();
    if (!expr) continue;
    const text = expr.getText().trim();
    if (/^-\d+$/.test(text)) {
      ret.replaceWithText(`throw new Error("Error code: ${text}")`);
      replaced++;
    }
  }

  if (replaced === 0) {
    return {
      success: false,
      filesChanged: [],
      description: `No negative return statements found in '${p.target}'`,
    };
  }

  // Update return type if it was a number; set to void since all error paths now throw
  const returnTypeNode = fn.getReturnTypeNode();
  if (returnTypeNode && returnTypeNode.getText() === "number") {
    fn.setReturnType("void");
  }

  return {
    success: true,
    filesChanged: [p.file],
    description: `Replaced ${replaced} error code return(s) with exceptions in function '${p.target}'`,
  };
}

export const replaceErrorCodeWithException: RefactoringDefinition = {
  name: "Replace Error Code With Exception",
  kebabName: "replace-error-code-with-exception",
  description:
    "Replaces negative numeric return values (error codes) with thrown exceptions in a function.",
  tier: 2,
  params,
  preconditions: (project: Project, raw: unknown): PreconditionResult =>
    preconditions(project, params.validate(raw) as ReplaceErrorCodeWithExceptionParams),
  apply: (project: Project, raw: unknown): RefactoringResult =>
    apply(project, params.validate(raw) as ReplaceErrorCodeWithExceptionParams),
};
