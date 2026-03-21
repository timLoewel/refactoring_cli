import { Node, SyntaxKind } from "ts-morph";
import type { Project } from "ts-morph";
import type {
  RefactoringDefinition,
  ParamSchema,
  PreconditionResult,
  RefactoringResult,
} from "../../engine/refactoring.types.js";

export interface ReplaceMagicLiteralParams {
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
      description: "The literal value to replace (as a string, e.g. '42' or '\"hello\"')",
      required: true,
    },
    {
      name: "name",
      type: "string",
      description: "Name for the new named constant",
      required: true,
    },
  ],
  validate(raw: unknown): ReplaceMagicLiteralParams {
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

function findMagicLiterals(
  project: Project,
  file: string,
  target: string,
): { count: number; error: string | null } {
  const sf = project.getSourceFile(file);
  if (!sf) {
    return { count: 0, error: `File not found in project: ${file}` };
  }

  const matches = sf.getDescendants().filter((n) => {
    const kind = n.getKind();
    return (
      (kind === SyntaxKind.NumericLiteral || kind === SyntaxKind.StringLiteral) &&
      n.getText() === target
    );
  });

  return { count: matches.length, error: null };
}

function preconditions(project: Project, p: ReplaceMagicLiteralParams): PreconditionResult {
  const errors: string[] = [];

  const sf = project.getSourceFile(p.file);
  if (!sf) {
    errors.push(`File not found in project: ${p.file}`);
    return { ok: false, errors };
  }

  const { count, error } = findMagicLiterals(project, p.file, p.target);
  if (error) {
    errors.push(error);
    return { ok: false, errors };
  }

  if (count === 0) {
    errors.push(`Literal '${p.target}' not found in file: ${p.file}`);
  }

  if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(p.name)) {
    errors.push(`'${p.name}' is not a valid identifier`);
  }

  // Ensure no existing declaration with that name
  const existing = sf
    .getDescendantsOfKind(SyntaxKind.VariableDeclaration)
    .find((d) => d.getName() === p.name);
  if (existing) {
    errors.push(`A variable named '${p.name}' already exists in the file`);
  }

  return { ok: errors.length === 0, errors };
}

function apply(project: Project, p: ReplaceMagicLiteralParams): RefactoringResult {
  const sf = project.getSourceFile(p.file);
  if (!sf) {
    return {
      success: false,
      filesChanged: [],
      description: `File not found: ${p.file}`,
      diff: [],
    };
  }

  const literalNodes = sf.getDescendants().filter((n) => {
    const kind = n.getKind();
    return (
      (kind === SyntaxKind.NumericLiteral || kind === SyntaxKind.StringLiteral) &&
      n.getText() === p.target
    );
  });

  if (literalNodes.length === 0) {
    return {
      success: false,
      filesChanged: [],
      description: `Literal '${p.target}' not found in file`,
      diff: [],
    };
  }

  // Filter out the node that will become the constant's own initializer —
  // we will keep that one as-is inside the const declaration.
  // Replace all occurrences in reverse order, then insert the constant declaration.
  const sorted = [...literalNodes].sort((a, b) => b.getStart() - a.getStart());
  for (const node of sorted) {
    // Skip if it is already inside a variable declaration named p.name (won't exist yet,
    // but guard defensively)
    const ancestor = node.getParent();
    if (ancestor && Node.isVariableDeclaration(ancestor) && ancestor.getName() === p.name) {
      continue;
    }
    node.replaceWithText(p.name);
  }

  // Insert `const NAME = VALUE;` at the top of the source file
  sf.insertStatements(0, `const ${p.name} = ${p.target};\n`);

  return {
    success: true,
    filesChanged: [p.file],
    description: `Replaced magic literal '${p.target}' with named constant '${p.name}'`,
    diff: [],
  };
}

export const replaceMagicLiteral: RefactoringDefinition = {
  name: "Replace Magic Literal",
  kebabName: "replace-magic-literal",
  description:
    "Replaces all occurrences of a magic literal value with a named constant declaration.",
  tier: 1,
  params,
  preconditions: (project: Project, raw: unknown): PreconditionResult =>
    preconditions(project, params.validate(raw) as ReplaceMagicLiteralParams),
  apply: (project: Project, raw: unknown): RefactoringResult =>
    apply(project, params.validate(raw) as ReplaceMagicLiteralParams),
};
