import { Node, SyntaxKind } from "ts-morph";
import type { Project } from "ts-morph";
import type {
  RefactoringDefinition,
  ParamSchema,
  PreconditionResult,
  RefactoringResult,
} from "../../engine/refactoring.types.js";

export interface RemoveDeadCodeParams {
  file: string;
  target: string;
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
      description: "Name of the unused function or variable declaration to remove",
      required: true,
    },
  ],
  validate(raw: unknown): RemoveDeadCodeParams {
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

/**
 * Count the number of references to `name` that are not the declaration itself.
 */
function countUsages(project: Project, file: string, name: string): number {
  const sf = project.getSourceFile(file);
  if (!sf) {
    return 0;
  }

  const allIdentifiers = sf.getDescendantsOfKind(SyntaxKind.Identifier).filter((id) => {
    if (id.getText() !== name) return false;
    const parent = id.getParent();
    if (!parent) return false;
    // Exclude function declaration name
    if (Node.isFunctionDeclaration(parent) && parent.getNameNode() === id) return false;
    // Exclude variable declaration name
    if (Node.isVariableDeclaration(parent) && parent.getNameNode() === id) return false;
    return true;
  });

  return allIdentifiers.length;
}

function preconditions(project: Project, p: RemoveDeadCodeParams): PreconditionResult {
  const errors: string[] = [];

  const sf = project.getSourceFile(p.file);
  if (!sf) {
    errors.push(`File not found in project: ${p.file}`);
    return { ok: false, errors };
  }

  // Check that a function or variable with this name exists
  const funcDecl = sf
    .getDescendantsOfKind(SyntaxKind.FunctionDeclaration)
    .find((d) => d.getName() === p.target);

  const varDecl = sf
    .getDescendantsOfKind(SyntaxKind.VariableDeclaration)
    .find((d) => d.getName() === p.target);

  if (!funcDecl && !varDecl) {
    errors.push(`No function or variable named '${p.target}' found in file: ${p.file}`);
    return { ok: false, errors };
  }

  const usageCount = countUsages(project, p.file, p.target);
  if (usageCount > 0) {
    errors.push(`Symbol '${p.target}' has ${usageCount} usage(s) and is not dead code`);
  }

  return { ok: errors.length === 0, errors };
}

function apply(project: Project, p: RemoveDeadCodeParams): RefactoringResult {
  const sf = project.getSourceFile(p.file);
  if (!sf) {
    return {
      success: false,
      filesChanged: [],
      description: `File not found: ${p.file}`,
    };
  }

  // Try function declaration first
  const funcDecl = sf
    .getDescendantsOfKind(SyntaxKind.FunctionDeclaration)
    .find((d) => d.getName() === p.target);

  if (funcDecl) {
    funcDecl.remove();
    return {
      success: true,
      filesChanged: [p.file],
      description: `Removed unused function declaration '${p.target}'`,
    };
  }

  // Try variable declaration
  const varDecl = sf
    .getDescendantsOfKind(SyntaxKind.VariableDeclaration)
    .find((d) => d.getName() === p.target);

  if (!varDecl) {
    return {
      success: false,
      filesChanged: [],
      description: `No function or variable named '${p.target}' found`,
    };
  }

  // Remove the containing variable statement
  const declList = varDecl.getParent();
  if (declList && Node.isVariableDeclarationList(declList)) {
    const stmt = declList.getParent();
    if (stmt && Node.isVariableStatement(stmt)) {
      stmt.remove();
    } else {
      varDecl.remove();
    }
  } else {
    varDecl.remove();
  }

  return {
    success: true,
    filesChanged: [p.file],
    description: `Removed unused variable declaration '${p.target}'`,
  };
}

export const removeDeadCode: RefactoringDefinition = {
  name: "Remove Dead Code",
  kebabName: "remove-dead-code",
  description:
    "Removes an unused function or variable declaration that is never referenced in the file.",
  tier: 1,
  params,
  preconditions: (project: Project, raw: unknown): PreconditionResult =>
    preconditions(project, params.validate(raw) as RemoveDeadCodeParams),
  apply: (project: Project, raw: unknown): RefactoringResult =>
    apply(project, params.validate(raw) as RemoveDeadCodeParams),
};
