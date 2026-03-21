import { Node, SyntaxKind } from "ts-morph";
import type { Project } from "ts-morph";
import type {
  RefactoringDefinition,
  ParamSchema,
  PreconditionResult,
  RefactoringResult,
} from "../../engine/refactoring.types.js";

export interface ReplaceTempWithQueryParams {
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
      description: "Name of the temporary variable to replace",
      required: true,
    },
    {
      name: "name",
      type: "string",
      description: "Name for the new query function",
      required: true,
    },
  ],
  validate(raw: unknown): ReplaceTempWithQueryParams {
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

function preconditions(project: Project, p: ReplaceTempWithQueryParams): PreconditionResult {
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
    errors.push(`Variable '${p.target}' has no initializer`);
  }

  if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(p.name)) {
    errors.push(`'${p.name}' is not a valid identifier`);
  }

  return { ok: errors.length === 0, errors };
}

function apply(project: Project, p: ReplaceTempWithQueryParams): RefactoringResult {
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
  const funcName = p.name;

  // Find the declaration's containing statement so we know where to insert the function
  const declStatement = decl.getParent();
  if (!declStatement) {
    return {
      success: false,
      filesChanged: [],
      description: `Could not locate declaration statement for '${p.target}'`,
      diff: [],
    };
  }

  const scopeParent = declStatement.getParent();
  if (!scopeParent) {
    return {
      success: false,
      filesChanged: [],
      description: `Could not locate scope parent for '${p.target}'`,
      diff: [],
    };
  }

  // Replace all identifier references to the temp variable with a call to the query function
  const references = sf.getDescendantsOfKind(SyntaxKind.Identifier).filter((id) => {
    if (id.getText() !== p.target) return false;
    const parent = id.getParent();
    if (!parent) return false;
    if (Node.isVariableDeclaration(parent) && parent.getNameNode() === id) return false;
    return true;
  });

  const sorted = [...references].sort((a, b) => b.getStart() - a.getStart());
  for (const ref of sorted) {
    ref.replaceWithText(`${funcName}()`);
  }

  // Remove the temp variable declaration
  if (Node.isVariableDeclarationList(declStatement)) {
    const listParent = declStatement.getParent();
    if (listParent && Node.isVariableStatement(listParent)) {
      listParent.remove();
    }
  } else if (Node.isVariableStatement(declStatement)) {
    declStatement.remove();
  }

  // Insert the query function at the top of the source file (before first statement)
  sf.insertStatements(0, `function ${funcName}(): number {\n  return ${initText};\n}\n`);

  return {
    success: true,
    filesChanged: [p.file],
    description: `Replaced temp variable '${p.target}' with query function '${funcName}()'`,
    diff: [],
  };
}

export const replaceTempWithQuery: RefactoringDefinition = {
  name: "Replace Temp with Query",
  kebabName: "replace-temp-with-query",
  description:
    "Replaces a temporary variable with a call to a new extracted query function that computes the same value.",
  tier: 1,
  params,
  preconditions: (project: Project, raw: unknown): PreconditionResult =>
    preconditions(project, params.validate(raw) as ReplaceTempWithQueryParams),
  apply: (project: Project, raw: unknown): RefactoringResult =>
    apply(project, params.validate(raw) as ReplaceTempWithQueryParams),
};
