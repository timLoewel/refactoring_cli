import { Node, SyntaxKind } from "ts-morph";
import type { Project } from "ts-morph";
import type {
  RefactoringDefinition,
  ParamSchema,
  PreconditionResult,
  RefactoringResult,
} from "../../engine/refactoring.types.js";

export interface InlineVariableParams {
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
      description: "Name of the variable to inline",
      required: true,
    },
  ],
  validate(raw: unknown): InlineVariableParams {
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

function preconditions(project: Project, p: InlineVariableParams): PreconditionResult {
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
    return { ok: false, errors };
  }

  const initializer = decl.getInitializer();
  if (!initializer) {
    errors.push(`Variable '${p.target}' has no initializer and cannot be inlined`);
  }

  return { ok: errors.length === 0, errors };
}

function apply(project: Project, p: InlineVariableParams): RefactoringResult {
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

  const initializer = decl.getInitializer();
  if (!initializer) {
    return {
      success: false,
      filesChanged: [],
      description: `Variable '${p.target}' has no initializer`,
      diff: [],
    };
  }

  const initText = initializer.getText();

  // Find all identifier references to this variable (excluding the declaration itself)
  const references = sf.getDescendantsOfKind(SyntaxKind.Identifier).filter((id) => {
    if (id.getText() !== p.target) return false;
    const parent = id.getParent();
    if (!parent) return false;
    // Exclude the declaration name itself
    if (Node.isVariableDeclaration(parent) && parent.getNameNode() === id) return false;
    return true;
  });

  // Replace in reverse order to preserve positions
  const sorted = [...references].sort((a, b) => b.getStart() - a.getStart());
  for (const ref of sorted) {
    ref.replaceWithText(initText);
  }

  // Remove the variable declaration statement
  const declStatement = decl.getParent();
  if (!declStatement) {
    return {
      success: false,
      filesChanged: [],
      description: `Could not locate declaration statement for '${p.target}'`,
      diff: [],
    };
  }
  const declStatementParent = declStatement.getParent();
  if (!declStatementParent) {
    return {
      success: false,
      filesChanged: [],
      description: `Could not locate parent of declaration statement for '${p.target}'`,
      diff: [],
    };
  }

  if (Node.isVariableDeclarationList(declStatement)) {
    const list = declStatement;
    const listParent = list.getParent();
    if (listParent && Node.isVariableStatement(listParent)) {
      listParent.remove();
    }
  } else if (Node.isVariableStatement(declStatement)) {
    declStatement.remove();
  }

  return {
    success: true,
    filesChanged: [p.file],
    description: `Inlined variable '${p.target}' with its initializer '${initText}'`,
    diff: [],
  };
}

export const inlineVariable: RefactoringDefinition = {
  name: "Inline Variable",
  kebabName: "inline-variable",
  description:
    "Replaces all references to a variable with its initializer expression and removes the declaration.",
  tier: 1,
  params,
  preconditions: (project: Project, raw: unknown): PreconditionResult =>
    preconditions(project, params.validate(raw) as InlineVariableParams),
  apply: (project: Project, raw: unknown): RefactoringResult =>
    apply(project, params.validate(raw) as InlineVariableParams),
};
