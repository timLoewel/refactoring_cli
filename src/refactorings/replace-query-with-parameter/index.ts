import { SyntaxKind } from "ts-morph";
import type { Project } from "ts-morph";
import type {
  RefactoringDefinition,
  ParamSchema,
  PreconditionResult,
  RefactoringResult,
} from "../../engine/refactoring.types.js";

interface ReplaceQueryWithParameterParams {
  file: string;
  target: string;
  query: string;
  paramName: string;
}

const params: ParamSchema = {
  definitions: [
    { name: "file", type: "string", description: "Path to the TypeScript file", required: true },
    {
      name: "target",
      type: "string",
      description: "Name of the function to modify",
      required: true,
    },
    {
      name: "query",
      type: "string",
      description: "The expression inside the function to replace with a parameter",
      required: true,
    },
    {
      name: "paramName",
      type: "string",
      description: "Name for the new parameter",
      required: true,
    },
  ],
  validate(raw: unknown): ReplaceQueryWithParameterParams {
    const r = raw as Record<string, unknown>;
    if (typeof r["file"] !== "string" || r["file"].trim() === "") {
      throw new Error("param 'file' must be a non-empty string");
    }
    if (typeof r["target"] !== "string" || r["target"].trim() === "") {
      throw new Error("param 'target' must be a non-empty string");
    }
    if (typeof r["query"] !== "string" || r["query"].trim() === "") {
      throw new Error("param 'query' must be a non-empty string");
    }
    if (typeof r["paramName"] !== "string" || r["paramName"].trim() === "") {
      throw new Error("param 'paramName' must be a non-empty string");
    }
    return {
      file: r["file"] as string,
      target: r["target"] as string,
      query: r["query"] as string,
      paramName: r["paramName"] as string,
    };
  },
};

function preconditions(project: Project, p: ReplaceQueryWithParameterParams): PreconditionResult {
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

  const bodyText = body.getText();
  if (!bodyText.includes(p.query)) {
    errors.push(`Expression '${p.query}' not found in body of '${p.target}'`);
  }

  const existing = fn.getParameter(p.paramName);
  if (existing) {
    errors.push(`Parameter '${p.paramName}' already exists in function '${p.target}'`);
  }

  return { ok: errors.length === 0, errors };
}

function apply(project: Project, p: ReplaceQueryWithParameterParams): RefactoringResult {
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

  // Add new parameter to function signature
  fn.addParameter({ name: p.paramName, type: "unknown" });

  // Replace occurrences of the query expression in the body with the new param name
  const bodyText = body.getText();
  const updatedBody = bodyText.split(p.query).join(p.paramName);
  body.replaceWithText(updatedBody);

  // Update all call sites to pass the query expression as the new argument
  const callExprs = sf.getDescendantsOfKind(SyntaxKind.CallExpression).filter((c) => {
    return c.getExpression().getText() === p.target;
  });

  for (const call of callExprs) {
    call.addArgument(p.query);
  }

  return {
    success: true,
    filesChanged: [p.file],
    description: `Replaced query '${p.query}' in '${p.target}' with new parameter '${p.paramName}'`,
    diff: [],
  };
}

export const replaceQueryWithParameter: RefactoringDefinition = {
  name: "Replace Query With Parameter",
  kebabName: "replace-query-with-parameter",
  description:
    "Replaces a global or module-level expression used inside a function with an explicit parameter, making the dependency visible.",
  tier: 2,
  params,
  preconditions: (project: Project, raw: unknown): PreconditionResult =>
    preconditions(project, params.validate(raw) as ReplaceQueryWithParameterParams),
  apply: (project: Project, raw: unknown): RefactoringResult =>
    apply(project, params.validate(raw) as ReplaceQueryWithParameterParams),
};
