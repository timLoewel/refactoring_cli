import { SyntaxKind, Node } from "ts-morph";
import type { Project } from "ts-morph";
import type {
  RefactoringDefinition,
  ParamSchema,
  PreconditionResult,
  RefactoringResult,
} from "../../engine/refactoring.types.js";

interface ReplaceParameterWithQueryParams {
  file: string;
  target: string;
  param: string;
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
      name: "param",
      type: "string",
      description: "Name of the parameter to remove and replace with an internal query",
      required: true,
    },
  ],
  validate(raw: unknown): ReplaceParameterWithQueryParams {
    const r = raw as Record<string, unknown>;
    if (typeof r["file"] !== "string" || r["file"].trim() === "") {
      throw new Error("param 'file' must be a non-empty string");
    }
    if (typeof r["target"] !== "string" || r["target"].trim() === "") {
      throw new Error("param 'target' must be a non-empty string");
    }
    if (typeof r["param"] !== "string" || r["param"].trim() === "") {
      throw new Error("param 'param' must be a non-empty string");
    }
    return {
      file: r["file"] as string,
      target: r["target"] as string,
      param: r["param"] as string,
    };
  },
};

function preconditions(project: Project, p: ReplaceParameterWithQueryParams): PreconditionResult {
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

  const paramNode = fn.getParameter(p.param);
  if (!paramNode) {
    errors.push(`Parameter '${p.param}' not found in function '${p.target}'`);
  }

  return { ok: errors.length === 0, errors };
}

function apply(project: Project, p: ReplaceParameterWithQueryParams): RefactoringResult {
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

  const paramNode = fn.getParameter(p.param);
  if (!paramNode) {
    return {
      success: false,
      filesChanged: [],
      description: `Parameter '${p.param}' not found in '${p.target}'`,
      diff: [],
    };
  }

  const paramTypeNode = paramNode.getTypeNode();
  const paramType = paramTypeNode ? paramTypeNode.getText() : "unknown";

  // Get the index of the parameter to drop from call sites
  const paramIndex = fn.getParameters().findIndex((pr) => pr.getName() === p.param);

  // Add a local variable at the start of the function body that derives the value
  const body = fn.getBody();
  if (!body) {
    return {
      success: false,
      filesChanged: [],
      description: `Function '${p.target}' has no body`,
      diff: [],
    };
  }

  // Insert a local const at the top of the body as a placeholder query
  if (!Node.isBlock(body)) {
    return {
      success: false,
      filesChanged: [],
      description: `Function '${p.target}' body is not a block`,
      diff: [],
    };
  }
  body.insertStatements(
    0,
    `const ${p.param}: ${paramType} = /* TODO: replace with actual query */ ${p.param} as unknown as ${paramType};`,
  );

  // Remove the parameter from the function signature
  paramNode.remove();

  // Update all call sites to drop the corresponding argument
  const callExprs = sf.getDescendantsOfKind(SyntaxKind.CallExpression).filter((c) => {
    return c.getExpression().getText() === p.target;
  });

  for (const call of callExprs) {
    const args = call.getArguments();
    if (paramIndex < args.length) {
      call.removeArgument(paramIndex);
    }
  }

  return {
    success: true,
    filesChanged: [p.file],
    description: `Removed parameter '${p.param}' from '${p.target}' and replaced with internal query placeholder`,
    diff: [],
  };
}

export const replaceParameterWithQuery: RefactoringDefinition = {
  name: "Replace Parameter With Query",
  kebabName: "replace-parameter-with-query",
  description:
    "Removes a parameter that can be derived inside the function and replaces it with an internal computation.",
  tier: 2,
  params,
  preconditions: (project: Project, raw: unknown): PreconditionResult =>
    preconditions(project, params.validate(raw) as ReplaceParameterWithQueryParams),
  apply: (project: Project, raw: unknown): RefactoringResult =>
    apply(project, params.validate(raw) as ReplaceParameterWithQueryParams),
};
