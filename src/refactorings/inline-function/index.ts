import { SyntaxKind, Node } from "ts-morph";
import type { Project, Statement } from "ts-morph";
import type {
  RefactoringDefinition,
  ParamSchema,
  PreconditionResult,
  RefactoringResult,
} from "../../engine/refactoring.types.js";

interface InlineFunctionParams {
  file: string;
  target: string;
}

const params: ParamSchema = {
  definitions: [
    { name: "file", type: "string", description: "Path to the TypeScript file", required: true },
    {
      name: "target",
      type: "string",
      description: "Name of the function to inline",
      required: true,
    },
  ],
  validate(raw: unknown): InlineFunctionParams {
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

function preconditions(project: Project, p: InlineFunctionParams): PreconditionResult {
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
    errors.push(`Function '${p.target}' has no body and cannot be inlined`);
  }

  return { ok: errors.length === 0, errors };
}

function apply(project: Project, p: InlineFunctionParams): RefactoringResult {
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

  // Get body statements as text (strip outer braces)
  const bodyStatements: Statement[] = Node.isBlock(body) ? body.getStatements() : [];
  const bodyText = bodyStatements.map((s: Statement) => s.getText()).join("\n");

  // Replace call expressions matching the target function
  const calls = sf.getDescendantsOfKind(SyntaxKind.CallExpression).filter((c) => {
    const expr = c.getExpression();
    return expr.getText() === p.target;
  });

  // Replace each call site's expression statement with the inlined body
  const callStatements = calls
    .map((c) => {
      const parent = c.getParent();
      if (parent && SyntaxKind[parent.getKind()] === "ExpressionStatement") {
        return parent;
      }
      return null;
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);

  const sorted = [...callStatements].sort((a, b) => b.getStart() - a.getStart());
  for (const stmt of sorted) {
    stmt.replaceWithText(bodyText);
  }

  // Remove the function declaration
  fn.remove();

  return {
    success: true,
    filesChanged: [p.file],
    description: `Inlined function '${p.target}' at ${sorted.length} call site(s)`,
  };
}

export const inlineFunction: RefactoringDefinition = {
  name: "Inline Function",
  kebabName: "inline-function",
  description:
    "Replaces all call sites of a function with the function's body and removes the declaration.",
  tier: 2,
  params,
  preconditions: (project: Project, raw: unknown): PreconditionResult =>
    preconditions(project, params.validate(raw) as InlineFunctionParams),
  apply: (project: Project, raw: unknown): RefactoringResult =>
    apply(project, params.validate(raw) as InlineFunctionParams),
};
