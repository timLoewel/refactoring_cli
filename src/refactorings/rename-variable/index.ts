import { Node, SyntaxKind } from "ts-morph";
import type { Project } from "ts-morph";
import type {
  RefactoringDefinition,
  ParamSchema,
  PreconditionResult,
  RefactoringResult,
} from "../../engine/refactoring.types.js";

export interface RenameVariableParams {
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
      description: "Current name of the variable to rename",
      required: true,
    },
    {
      name: "name",
      type: "string",
      description: "New name for the variable",
      required: true,
    },
  ],
  validate(raw: unknown): RenameVariableParams {
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

function preconditions(project: Project, p: RenameVariableParams): PreconditionResult {
  const errors: string[] = [];

  const sf = project.getSourceFile(p.file);
  if (!sf) {
    errors.push(`File not found in project: ${p.file}`);
    return { ok: false, errors };
  }

  const decl = sf
    .getDescendantsOfKind(SyntaxKind.VariableDeclaration)
    .find((d) => d.getName() === p.target);

  if (!decl) {
    errors.push(`Variable '${p.target}' not found in file: ${p.file}`);
  }

  if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(p.name)) {
    errors.push(`'${p.name}' is not a valid identifier`);
  }

  return { ok: errors.length === 0, errors };
}

function apply(project: Project, p: RenameVariableParams): RefactoringResult {
  const sf = project.getSourceFile(p.file);
  if (!sf) {
    return {
      success: false,
      filesChanged: [],
      description: `File not found: ${p.file}`,
      diff: [],
    };
  }

  const decl = sf
    .getDescendantsOfKind(SyntaxKind.VariableDeclaration)
    .find((d) => d.getName() === p.target);

  if (!decl) {
    return {
      success: false,
      filesChanged: [],
      description: `Variable '${p.target}' not found`,
      diff: [],
    };
  }

  // ts-morph rename propagates to all references in scope.
  // getNameNode() returns BindingName which may be a destructuring pattern;
  // we only support simple identifier declarations.
  const nameNode = decl.getNameNode();
  if (!Node.isIdentifier(nameNode)) {
    return {
      success: false,
      filesChanged: [],
      description: `Variable '${p.target}' uses destructuring and cannot be renamed with this refactoring`,
      diff: [],
    };
  }
  nameNode.rename(p.name);

  return {
    success: true,
    filesChanged: [p.file],
    description: `Renamed variable '${p.target}' to '${p.name}' across all references`,
    diff: [],
  };
}

export const renameVariable: RefactoringDefinition = {
  name: "Rename Variable",
  kebabName: "rename-variable",
  description:
    "Renames a variable and all its references using ts-morph's rename, ensuring scope-aware renaming.",
  tier: 1,
  params,
  preconditions: (project: Project, raw: unknown): PreconditionResult =>
    preconditions(project, params.validate(raw) as RenameVariableParams),
  apply: (project: Project, raw: unknown): RefactoringResult =>
    apply(project, params.validate(raw) as RenameVariableParams),
};
