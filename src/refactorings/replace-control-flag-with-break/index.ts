import { Node, SyntaxKind } from "ts-morph";
import type { Project } from "ts-morph";
import type {
  RefactoringDefinition,
  ParamSchema,
  PreconditionResult,
  RefactoringResult,
} from "../../engine/refactoring.types.js";

export interface ReplaceControlFlagWithBreakParams {
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
      description: "Name of the boolean control flag variable to replace",
      required: true,
    },
  ],
  validate(raw: unknown): ReplaceControlFlagWithBreakParams {
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

function preconditions(project: Project, p: ReplaceControlFlagWithBreakParams): PreconditionResult {
  const errors: string[] = [];

  const sf = project.getSourceFile(p.file);
  if (!sf) {
    errors.push(`File not found in project: ${p.file}`);
    return { ok: false, errors };
  }

  const varDecl = sf
    .getDescendantsOfKind(SyntaxKind.VariableDeclaration)
    .find((d) => d.getName() === p.target);

  if (!varDecl) {
    errors.push(`Variable '${p.target}' not found in file: ${p.file}`);
    return { ok: false, errors };
  }

  const initializer = varDecl.getInitializer();
  if (!initializer) {
    errors.push(`Variable '${p.target}' has no initializer`);
    return { ok: false, errors };
  }

  const initKind = initializer.getKind();
  if (initKind !== SyntaxKind.TrueKeyword && initKind !== SyntaxKind.FalseKeyword) {
    errors.push(`Variable '${p.target}' must be initialized with a boolean literal`);
  }

  // Check that there is a loop in the same scope that uses this flag
  const loopKinds = [
    SyntaxKind.WhileStatement,
    SyntaxKind.ForStatement,
    SyntaxKind.ForInStatement,
    SyntaxKind.ForOfStatement,
    SyntaxKind.DoStatement,
  ];

  const loops = sf.getDescendants().filter((n) => loopKinds.includes(n.getKind()));
  const usedInLoop = loops.some((loop) => {
    return loop.getDescendantsOfKind(SyntaxKind.Identifier).some((id) => id.getText() === p.target);
  });

  if (!usedInLoop) {
    errors.push(`Variable '${p.target}' is not used inside any loop`);
  }

  return { ok: errors.length === 0, errors };
}

const LOOP_KINDS = new Set([
  SyntaxKind.WhileStatement,
  SyntaxKind.ForStatement,
  SyntaxKind.ForInStatement,
  SyntaxKind.ForOfStatement,
  SyntaxKind.DoStatement,
]);

function findLoopUsingFlag(sf: Node, flagName: string): Node | undefined {
  const loops = sf.getDescendants().filter((n) => LOOP_KINDS.has(n.getKind()));
  return loops.find((loop) =>
    loop.getDescendantsOfKind(SyntaxKind.Identifier).some((id) => id.getText() === flagName),
  );
}

function replaceFlagAssignmentsWithBreak(loop: Node, flagName: string): void {
  const flagAssignments = loop.getDescendantsOfKind(SyntaxKind.BinaryExpression).filter((bin) => {
    const left = bin.getLeft();
    const op = bin.getOperatorToken().getText();
    return Node.isIdentifier(left) && left.getText() === flagName && op === "=";
  });

  const sorted = [...flagAssignments].sort((a, b) => b.getStart() - a.getStart());
  for (const assignment of sorted) {
    const exprStmt = assignment.getParent();
    if (exprStmt && Node.isExpressionStatement(exprStmt)) {
      exprStmt.replaceWithText("break;");
    }
  }
}

function updateLoopCondition(loop: Node, flagName: string): void {
  if (Node.isWhileStatement(loop)) {
    const condition = loop.getExpression();
    const condText = condition.getText();
    if (condText === flagName || condText === `!${flagName}`) {
      condition.replaceWithText("true");
    }
  }
}

function removeFlagDeclaration(varDecl: Node): void {
  const declList = varDecl.getParent();
  if (declList && Node.isVariableDeclarationList(declList)) {
    const stmt = declList.getParent();
    if (stmt && Node.isVariableStatement(stmt)) {
      stmt.remove();
    }
  }
}

function inlineRemainingFlagChecks(loop: Node, flagName: string): void {
  const remainingRefs = loop
    .getDescendantsOfKind(SyntaxKind.Identifier)
    .filter((id) => id.getText() === flagName);

  const sorted = [...remainingRefs].sort((a, b) => b.getStart() - a.getStart());
  for (const ref of sorted) {
    const parent = ref.getParent();
    if (!parent || !Node.isIfStatement(parent) || parent.getExpression() !== ref) continue;

    const thenStmt = parent.getThenStatement();
    if (Node.isBlock(thenStmt)) {
      parent.replaceWithText(
        thenStmt
          .getStatements()
          .map((s) => s.getText())
          .join("\n"),
      );
    } else {
      parent.replaceWithText(thenStmt.getText());
    }
  }
}

function apply(project: Project, p: ReplaceControlFlagWithBreakParams): RefactoringResult {
  const sf = project.getSourceFile(p.file);
  if (!sf) {
    return { success: false, filesChanged: [], description: `File not found: ${p.file}`, diff: [] };
  }

  const varDecl = sf
    .getDescendantsOfKind(SyntaxKind.VariableDeclaration)
    .find((d) => d.getName() === p.target);
  if (!varDecl) {
    return {
      success: false,
      filesChanged: [],
      description: `Variable '${p.target}' not found`,
      diff: [],
    };
  }

  const targetLoop = findLoopUsingFlag(sf, p.target);
  if (!targetLoop) {
    return {
      success: false,
      filesChanged: [],
      description: `No loop found that uses '${p.target}'`,
      diff: [],
    };
  }

  replaceFlagAssignmentsWithBreak(targetLoop, p.target);
  updateLoopCondition(targetLoop, p.target);
  removeFlagDeclaration(varDecl);
  inlineRemainingFlagChecks(targetLoop, p.target);

  return {
    success: true,
    filesChanged: [p.file],
    description: `Replaced control flag '${p.target}' with break statement`,
    diff: [],
  };
}

export const replaceControlFlagWithBreak: RefactoringDefinition = {
  name: "Replace Control Flag with Break",
  kebabName: "replace-control-flag-with-break",
  description:
    "Replaces a boolean control flag used to exit a loop with an explicit break statement.",
  tier: 1,
  params,
  preconditions: (project: Project, raw: unknown): PreconditionResult =>
    preconditions(project, params.validate(raw) as ReplaceControlFlagWithBreakParams),
  apply: (project: Project, raw: unknown): RefactoringResult =>
    apply(project, params.validate(raw) as ReplaceControlFlagWithBreakParams),
};
