import { Node, SyntaxKind } from "ts-morph";
import type { Project } from "ts-morph";
import type {
  RefactoringDefinition,
  ParamSchema,
  PreconditionResult,
  RefactoringResult,
} from "../../engine/refactoring.types.js";

export interface SplitVariableParams {
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
      description: "Name of the variable to split",
      required: true,
    },
  ],
  validate(raw: unknown): SplitVariableParams {
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

function preconditions(project: Project, p: SplitVariableParams): PreconditionResult {
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

  // Check that the variable is declared with `let`
  const declList = decl.getParent();
  if (!declList || !Node.isVariableDeclarationList(declList)) {
    errors.push(`'${p.target}' is not in a variable declaration list`);
    return { ok: false, errors };
  }

  const flags = declList.getFlags();
  // NodeFlags.Let === 1, Const === 2
  if ((flags & 1) === 0) {
    errors.push(`Variable '${p.target}' must be declared with 'let' to be split`);
  }

  // Count assignments (excluding the initial declaration)
  const assignments = sf.getDescendantsOfKind(SyntaxKind.BinaryExpression).filter((bin) => {
    const left = bin.getLeft();
    return (
      Node.isIdentifier(left) &&
      left.getText() === p.target &&
      bin.getOperatorToken().getText() === "="
    );
  });

  if (assignments.length < 1) {
    errors.push(`Variable '${p.target}' is not reassigned; nothing to split`);
  }

  return { ok: errors.length === 0, errors };
}

function apply(project: Project, p: SplitVariableParams): RefactoringResult {
  const sf = project.getSourceFile(p.file);
  if (!sf) {
    return {
      success: false,
      filesChanged: [],
      description: `File not found: ${p.file}`,
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
    };
  }

  // Collect all assignment expressions to this variable (excluding declaration)
  const assignments = sf.getDescendantsOfKind(SyntaxKind.BinaryExpression).filter((bin) => {
    const left = bin.getLeft();
    return (
      Node.isIdentifier(left) &&
      left.getText() === p.target &&
      bin.getOperatorToken().getText() === "="
    );
  });

  if (assignments.length === 0) {
    return {
      success: false,
      filesChanged: [],
      description: `Variable '${p.target}' has no reassignments`,
    };
  }

  // Process in reverse order of source position so mutations don't shift positions
  const sortedAssignments = [...assignments].sort((a, b) => b.getStart() - a.getStart());

  let splitIndex = assignments.length;
  for (const assignment of sortedAssignments) {
    const rhs = assignment.getRight().getText();
    const newName = `${p.target}${splitIndex}`;
    splitIndex--;

    // The assignment is typically inside an ExpressionStatement
    const exprStmt = assignment.getParent();
    if (exprStmt && Node.isExpressionStatement(exprStmt)) {
      // Replace the ExpressionStatement with a const declaration
      exprStmt.replaceWithText(`const ${newName} = ${rhs};`);

      // Now rename subsequent references to target between this point and next assignment
      // We do a targeted rename: find identifiers after this position that still say `target`
      // and rename them to newName until the next assignment.
    }
  }

  // After splitting out reassignments, replace remaining references to `target` with `${target}1`
  // (the first assignment), and change the original `let` declaration to `const`
  const initializer = decl.getInitializer();
  const initText = initializer ? initializer.getText() : "undefined";
  const firstNewName = `${p.target}1`;

  // Replace all remaining identifier references to the original target with firstNewName
  const remainingRefs = sf.getDescendantsOfKind(SyntaxKind.Identifier).filter((id) => {
    if (id.getText() !== p.target) return false;
    const parent = id.getParent();
    if (!parent) return false;
    if (Node.isVariableDeclaration(parent) && parent.getNameNode() === id) return false;
    return true;
  });

  const sortedRefs = [...remainingRefs].sort((a, b) => b.getStart() - a.getStart());
  for (const ref of sortedRefs) {
    ref.replaceWithText(firstNewName);
  }

  // Replace the original `let target = ...` declaration with `const firstNewName = ...`
  const declStatement = decl.getParent();
  if (declStatement && Node.isVariableDeclarationList(declStatement)) {
    const stmt = declStatement.getParent();
    if (stmt && Node.isVariableStatement(stmt)) {
      stmt.replaceWithText(`const ${firstNewName} = ${initText};`);
    }
  }

  return {
    success: true,
    filesChanged: [p.file],
    description: `Split variable '${p.target}' into separate const variables for each assignment`,
  };
}

export const splitVariable: RefactoringDefinition = {
  name: "Split Variable",
  kebabName: "split-variable",
  description:
    "Splits a variable that is assigned multiple times for different purposes into separate named const variables.",
  tier: 1,
  params,
  preconditions: (project: Project, raw: unknown): PreconditionResult =>
    preconditions(project, params.validate(raw) as SplitVariableParams),
  apply: (project: Project, raw: unknown): RefactoringResult =>
    apply(project, params.validate(raw) as SplitVariableParams),
};
