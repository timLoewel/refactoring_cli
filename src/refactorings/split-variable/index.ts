import { Node, SyntaxKind } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { defineRefactoring, enumerate, param, resolve } from "../../core/refactoring-builder.js";
import type { SourceFileContext } from "../../core/refactoring.types.js";
import { cleanupUnused } from "../../core/cleanup-unused.js";

export const splitVariable = defineRefactoring<SourceFileContext>({
  name: "Split Variable",
  kebabName: "split-variable",
  tier: 1,
  description:
    "Splits a variable that is assigned multiple times for different purposes into separate named const variables.",
  params: [param.file(), param.identifier("target", "Name of the variable to split")],
  resolve: (project, params) => resolve.sourceFile(project, params as { file: string }),
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

    // Reject compound assignments (+=, -=, etc.) — they depend on the previous value
    const compoundAssignments = sf
      .getDescendantsOfKind(SyntaxKind.BinaryExpression)
      .filter((bin) => {
        const left = bin.getLeft();
        const op = bin.getOperatorToken().getText();
        return (
          Node.isIdentifier(left) && left.getText() === target && op !== "=" && op.endsWith("=")
        );
      });

    if (compoundAssignments.length > 0) {
      errors.push(
        `Variable '${target}' has compound assignments (${compoundAssignments.map((a) => a.getOperatorToken().getText()).join(", ")}); cannot split`,
      );
    }

    // Count simple assignments (excluding the initial declaration)
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

    // Reject if any assignment is inside a nested function/arrow/method (closure)
    // because splitting would create local variables that don't affect the outer scope.
    const declScope = decl
      .getAncestors()
      .find(
        (a) =>
          Node.isBlock(a) ||
          Node.isSourceFile(a) ||
          Node.isFunctionDeclaration(a) ||
          Node.isArrowFunction(a) ||
          Node.isFunctionExpression(a) ||
          Node.isMethodDeclaration(a),
      );
    for (const assignment of assignments) {
      const assignScope = assignment
        .getAncestors()
        .find(
          (a) =>
            Node.isFunctionDeclaration(a) ||
            Node.isArrowFunction(a) ||
            Node.isFunctionExpression(a) ||
            Node.isMethodDeclaration(a) ||
            Node.isSourceFile(a),
        );
      if (assignScope !== declScope?.getParentOrThrow() && assignScope !== declScope) {
        const closestFn = assignment
          .getAncestors()
          .find(
            (a) =>
              Node.isArrowFunction(a) ||
              Node.isFunctionExpression(a) ||
              Node.isFunctionDeclaration(a) ||
              Node.isMethodDeclaration(a),
          );
        const declClosestFn = decl
          .getAncestors()
          .find(
            (a) =>
              Node.isArrowFunction(a) ||
              Node.isFunctionExpression(a) ||
              Node.isFunctionDeclaration(a) ||
              Node.isMethodDeclaration(a),
          );
        if (closestFn !== declClosestFn) {
          errors.push(
            `Variable '${target}' is assigned inside a nested function/arrow; cannot safely split`,
          );
          break;
        }
      }
    }

    // Reject if any assignment is in a deeper block scope than some subsequent
    // reference — splitting would create a const in the inner scope invisible
    // to the outer reference.
    if (errors.length === 0 && declScope) {
      const sortedAssigns = [...assignments].sort((a, b) => a.getStart() - b.getStart());
      const scopeStart = declScope.getStart();
      const scopeEnd = declScope.getEnd();

      // Collect all identifier references within the declaration scope
      const allRefs = sf.getDescendantsOfKind(SyntaxKind.Identifier).filter((id) => {
        if (id.getText() !== target) return false;
        const pos = id.getStart();
        if (pos < scopeStart || pos > scopeEnd) return false;
        const parent = id.getParent();
        if (!parent) return false;
        if (Node.isVariableDeclaration(parent) && parent.getNameNode() === id) return false;
        if (
          Node.isBinaryExpression(parent) &&
          parent.getLeft() === id &&
          parent.getOperatorToken().getText() === "="
        )
          return false;
        return true;
      });

      // Compute segment starts (decl, then each assignment)
      const segStarts = [decl.getStart(), ...sortedAssigns.map((a) => a.getStart())];
      const getSegment = (pos: number): number => {
        let seg = 1;
        for (let i = 1; i < segStarts.length; i++) {
          if (pos > (segStarts[i] as number)) seg = i + 1;
        }
        return seg;
      };

      for (let i = 0; i < sortedAssigns.length; i++) {
        const assignment = sortedAssigns[i]!;
        const seg = i + 2; // assignments start at segment 2

        // Find the nearest enclosing block of this assignment
        const assignBlock = assignment
          .getAncestors()
          .find((a) => Node.isBlock(a) || Node.isSourceFile(a));
        if (!assignBlock) continue;

        const blockStart = assignBlock.getStart();
        const blockEnd = assignBlock.getEnd();

        // Check if any reference in this segment is outside the assignment's block
        for (const ref of allRefs) {
          if (getSegment(ref.getStart()) !== seg) continue;
          const refPos = ref.getStart();
          if (refPos < blockStart || refPos > blockEnd) {
            errors.push(
              `Variable '${target}' is assigned in a nested block but referenced outside it; cannot safely split`,
            );
            break;
          }
        }
        if (errors.length > 0) break;
      }
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

    // Find the scope (nearest enclosing block/function) of the declaration
    const declScope = decl
      .getAncestors()
      .find(
        (a) =>
          Node.isBlock(a) ||
          Node.isSourceFile(a) ||
          Node.isFunctionDeclaration(a) ||
          Node.isArrowFunction(a) ||
          Node.isFunctionExpression(a) ||
          Node.isMethodDeclaration(a),
      );
    const scopeStart = declScope ? declScope.getStart() : 0;
    const scopeEnd = declScope ? declScope.getEnd() : Infinity;

    // Collect all simple assignments to this variable (excluding declaration)
    // Only consider assignments within the same scope as the declaration
    const assignments = sf.getDescendantsOfKind(SyntaxKind.BinaryExpression).filter((bin) => {
      const left = bin.getLeft();
      if (
        !Node.isIdentifier(left) ||
        left.getText() !== target ||
        bin.getOperatorToken().getText() !== "="
      )
        return false;
      const pos = bin.getStart();
      return pos >= scopeStart && pos <= scopeEnd;
    });

    if (assignments.length === 0) {
      return {
        success: false,
        filesChanged: [],
        description: `Variable '${target}' has no reassignments`,
      };
    }

    // Sort assignments by source position (ascending)
    const sortedAssignments = [...assignments].sort((a, b) => a.getStart() - b.getStart());

    // Segment breakpoints (ascending): segment N starts at segmentStarts[N-1]
    // Segment 1 = initial declaration, segment 2 = first assignment, etc.
    const segmentStarts = [decl.getStart(), ...sortedAssignments.map((a) => a.getStart())];

    // Determine which segment (1-based) a position belongs to.
    // A reference at position P belongs to segment S if segmentStarts[S-1] <= P < segmentStarts[S].
    const getSegment = (pos: number): number => {
      let seg = 1;
      for (let i = 1; i < segmentStarts.length; i++) {
        if (pos > (segmentStarts[i] as number)) {
          seg = i + 1;
        }
      }
      return seg;
    };

    // Collect identifier references (not the declaration name, not the LHS of assignments)
    // Only consider references within the same scope as the declaration
    const refs = sf.getDescendantsOfKind(SyntaxKind.Identifier).filter((id) => {
      if (id.getText() !== target) return false;
      const pos = id.getStart();
      if (pos < scopeStart || pos > scopeEnd) return false;
      const parent = id.getParent();
      if (!parent) return false;
      // Skip the variable declaration name
      if (Node.isVariableDeclaration(parent) && parent.getNameNode() === id) return false;
      // Skip LHS of simple assignment expressions (those become the new const declaration name)
      if (
        Node.isBinaryExpression(parent) &&
        parent.getLeft() === id &&
        parent.getOperatorToken().getText() === "="
      )
        return false;
      return true;
    });

    // Pre-compute segment for each ref before any mutations.
    // Special case: references on the RHS of an assignment to this variable read
    // the value from the PREVIOUS segment, not the current one.
    const assignmentNodes = new Set(sortedAssignments.map((a) => a));
    const refSegments = refs.map((ref) => {
      let seg = getSegment(ref.getStart());
      // Walk up ancestors to check if this ref is inside the RHS of an assignment to this variable
      let anc: Node | undefined = ref;
      while (anc) {
        if (Node.isBinaryExpression(anc) && assignmentNodes.has(anc)) {
          // This ref is inside an assignment expression — check if it's on the RHS
          const rhsStart = anc.getRight().getStart();
          if (ref.getStart() >= rhsStart) {
            seg = Math.max(1, seg - 1);
          }
          break;
        }
        anc = anc.getParent();
      }
      return { ref, seg };
    });

    // Pre-compute segment index (1-based, starting at 2) for each assignment
    const assignmentSegments = sortedAssignments.map((a, i) => ({ assignment: a, seg: i + 2 }));

    // Build a flat list of all changes, sorted by descending start position
    type Change =
      | { kind: "ref"; pos: number; ref: (typeof refs)[number]; seg: number }
      | { kind: "assignment"; pos: number; assignment: (typeof assignments)[number]; seg: number }
      | { kind: "decl"; pos: number };

    const changes: Change[] = [
      ...refSegments.map(({ ref, seg }) => ({
        kind: "ref" as const,
        pos: ref.getStart(),
        ref,
        seg,
      })),
      ...assignmentSegments.map(({ assignment, seg }) => ({
        kind: "assignment" as const,
        pos: assignment.getStart(),
        assignment,
        seg,
      })),
      { kind: "decl" as const, pos: decl.getStart() },
    ];

    // Sort by descending position so each mutation doesn't invalidate later positions
    changes.sort((a, b) => b.pos - a.pos);

    const initializer = decl.getInitializer();
    const initText = initializer ? initializer.getText() : "undefined";

    for (const change of changes) {
      if (change.kind === "ref") {
        change.ref.replaceWithText(`${target}${change.seg}`);
      } else if (change.kind === "assignment") {
        const rhs = change.assignment.getRight().getText();
        const exprStmt = change.assignment.getParent();
        if (exprStmt && Node.isExpressionStatement(exprStmt)) {
          exprStmt.replaceWithText(`const ${target}${change.seg} = ${rhs};`);
        }
      } else {
        // Replace original `let target = ...` with `const target1 = ...`
        const declStatement = decl.getParent();
        if (declStatement && Node.isVariableDeclarationList(declStatement)) {
          const stmt = declStatement.getParent();
          if (stmt && Node.isVariableStatement(stmt)) {
            stmt.replaceWithText(`const ${target}1 = ${initText};`);
          }
        }
      }
    }

    cleanupUnused(sf);

    return {
      success: true,
      filesChanged: [file],
      description: `Split variable '${target}' into separate const variables for each assignment`,
    };
  },
  enumerate: enumerate.variables,
});
