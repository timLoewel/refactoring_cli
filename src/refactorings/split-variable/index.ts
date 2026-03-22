import { Node, SyntaxKind } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../engine/refactoring.types.js";
import {
  defineRefactoring,
  fileParam,
  identifierParam,
  resolveSourceFile,
} from "../../engine/refactoring-builder.js";
import type { SourceFileContext } from "../../engine/refactoring-builder.js";

export const splitVariable = defineRefactoring<SourceFileContext>({
  name: "Split Variable",
  kebabName: "split-variable",
  tier: 1,
  description:
    "Splits a variable that is assigned multiple times for different purposes into separate named const variables.",
  params: [
    fileParam(),
    identifierParam("target", "Name of the variable to split"),
  ],
  resolve: (project, params) =>
    resolveSourceFile(project, params as { file: string }),
  preconditions(ctx: SourceFileContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const sf = ctx.sourceFile;
    const target = params["target"] as string;

    const decl = sf
      .getDescendantsOfKind(SyntaxKind.VariableDeclaration)
      .find((d) => d.getName() === target);

    if (!decl) {
      errors.push(`Variable '${target}' not found in file`);
      return { ok: false, errors };
    }

    // Check that the variable is declared with `let`
    const declList = decl.getParent();
    if (!declList || !Node.isVariableDeclarationList(declList)) {
      errors.push(`'${target}' is not in a variable declaration list`);
      return { ok: false, errors };
    }

    const flags = declList.getFlags();
    // NodeFlags.Let === 1, Const === 2
    if ((flags & 1) === 0) {
      errors.push(`Variable '${target}' must be declared with 'let' to be split`);
    }

    // Count assignments (excluding the initial declaration)
    const assignments = sf.getDescendantsOfKind(SyntaxKind.BinaryExpression).filter((bin) => {
      const left = bin.getLeft();
      return (
        Node.isIdentifier(left) &&
        left.getText() === target &&
        bin.getOperatorToken().getText() === "="
      );
    });

    if (assignments.length < 1) {
      errors.push(`Variable '${target}' is not reassigned; nothing to split`);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: SourceFileContext, params: Record<string, unknown>): RefactoringResult {
    const sf = ctx.sourceFile;
    const file = params["file"] as string;
    const target = params["target"] as string;

    const decl = sf
      .getDescendantsOfKind(SyntaxKind.VariableDeclaration)
      .find((d) => d.getName() === target);

    if (!decl) {
      return {
        success: false,
        filesChanged: [],
        description: `Variable '${target}' not found`,
      };
    }

    // Collect all assignment expressions to this variable (excluding declaration)
    const assignments = sf.getDescendantsOfKind(SyntaxKind.BinaryExpression).filter((bin) => {
      const left = bin.getLeft();
      return (
        Node.isIdentifier(left) &&
        left.getText() === target &&
        bin.getOperatorToken().getText() === "="
      );
    });

    if (assignments.length === 0) {
      return {
        success: false,
        filesChanged: [],
        description: `Variable '${target}' has no reassignments`,
      };
    }

    // Process in reverse order of source position so mutations don't shift positions
    const sortedAssignments = [...assignments].sort((a, b) => b.getStart() - a.getStart());

    let splitIndex = assignments.length;
    for (const assignment of sortedAssignments) {
      const rhs = assignment.getRight().getText();
      const newName = `${target}${splitIndex}`;
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
    const firstNewName = `${target}1`;

    // Replace all remaining identifier references to the original target with firstNewName
    const remainingRefs = sf.getDescendantsOfKind(SyntaxKind.Identifier).filter((id) => {
      if (id.getText() !== target) return false;
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
      filesChanged: [file],
      description: `Split variable '${target}' into separate const variables for each assignment`,
    };
  },
});
