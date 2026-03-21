import { SyntaxKind } from "ts-morph";
import type { Project } from "ts-morph";
import type {
  RefactoringDefinition,
  ParamSchema,
  PreconditionResult,
  RefactoringResult,
} from "../../engine/refactoring.types.js";

interface ReplaceConditionalWithPolymorphismParams {
  file: string;
  target: string;
}

const params: ParamSchema = {
  definitions: [
    { name: "file", type: "string", description: "Path to the TypeScript file", required: true },
    {
      name: "target",
      type: "string",
      description: "Name of the function containing a switch statement to replace",
      required: true,
    },
  ],
  validate(raw: unknown): ReplaceConditionalWithPolymorphismParams {
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

function preconditions(
  project: Project,
  p: ReplaceConditionalWithPolymorphismParams,
): PreconditionResult {
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
    errors.push(`Function '${p.target}' has no body`);
    return { ok: false, errors };
  }

  const switchStmts = body.getDescendantsOfKind(SyntaxKind.SwitchStatement);
  if (switchStmts.length === 0) {
    errors.push(`Function '${p.target}' contains no switch statement`);
    return { ok: false, errors };
  }

  const switchStmt = switchStmts[0];
  if (!switchStmt) {
    errors.push(`No switch statement found in '${p.target}'`);
    return { ok: false, errors };
  }
  const cases = switchStmt
    .getCaseBlock()
    .getClauses()
    .filter((c) => c.getKind() === SyntaxKind.CaseClause);
  if (cases.length < 2) {
    errors.push(`Switch in '${p.target}' needs at least 2 case clauses to apply polymorphism`);
  }

  return { ok: errors.length === 0, errors };
}

function apply(project: Project, p: ReplaceConditionalWithPolymorphismParams): RefactoringResult {
  const sf = project.getSourceFile(p.file);
  if (!sf) {
    return { success: false, filesChanged: [], description: `File not found: ${p.file}`, diff: [] };
  }

  const fn = sf
    .getDescendantsOfKind(SyntaxKind.FunctionDeclaration)
    .find((f) => f.getName() === p.target);

  if (!fn) {
    return {
      success: false,
      filesChanged: [],
      description: `Function '${p.target}' not found`,
      diff: [],
    };
  }

  const body = fn.getBody();
  if (!body) {
    return {
      success: false,
      filesChanged: [],
      description: `Function '${p.target}' has no body`,
      diff: [],
    };
  }

  const switchStmts = body.getDescendantsOfKind(SyntaxKind.SwitchStatement);
  if (switchStmts.length === 0) {
    return {
      success: false,
      filesChanged: [],
      description: `No switch statement found in '${p.target}'`,
      diff: [],
    };
  }

  const switchStmt = switchStmts[0];
  if (!switchStmt) {
    return {
      success: false,
      filesChanged: [],
      description: `No switch statement found in '${p.target}'`,
      diff: [],
    };
  }
  const switchExpr = switchStmt.getExpression().getText();
  const clauses = switchStmt.getCaseBlock().getClauses();

  // Extract the return type of the function
  const returnTypeNode = fn.getReturnTypeNode();
  const returnType = returnTypeNode ? returnTypeNode.getText() : "unknown";

  // Get the first parameter to understand the type discriminant
  const fnParams = fn.getParameters();
  const firstParam = fnParams[0];
  const paramName = firstParam ? firstParam.getName() : "value";
  const paramType = firstParam ? (firstParam.getTypeNode()?.getText() ?? "unknown") : "unknown";

  // Build abstract base class and subclasses
  const baseName = `${p.target.charAt(0).toUpperCase()}${p.target.slice(1)}Base`;
  const methodName = p.target;

  const subclasses: string[] = [];
  const caseNames: string[] = [];

  for (const clause of clauses) {
    if (clause.getKind() !== SyntaxKind.CaseClause) continue;
    const caseClause = clause.asKind(SyntaxKind.CaseClause);
    if (!caseClause) continue;

    const caseExpr = caseClause.getExpression().getText();
    // Build a class name from the case expression
    const className = `${caseExpr.replace(/[^a-zA-Z0-9]/g, "_")}${baseName}`;
    caseNames.push(caseExpr);

    const stmts = caseClause.getStatements();
    // Strip trailing 'break;' statements
    const bodyStmts = stmts.filter((s) => s.getKind() !== SyntaxKind.BreakStatement);
    const bodyText = bodyStmts.map((s) => `    ${s.getText()}`).join("\n");

    subclasses.push(
      `class ${className} extends ${baseName} {\n  ${methodName}(${paramName}: ${paramType}): ${returnType} {\n${bodyText}\n  }\n}`,
    );
  }

  const baseClass = `abstract class ${baseName} {\n  abstract ${methodName}(${paramName}: ${paramType}): ${returnType};\n}`;

  // Replace the function with a dispatcher using the class hierarchy
  const factoryLines = caseNames.map((c) => {
    const className = `${c.replace(/[^a-zA-Z0-9]/g, "_")}${baseName}`;
    return `  if (${switchExpr} === ${c}) return new ${className}().${methodName}(${paramName});`;
  });

  const newFnText =
    `function ${p.target}(${paramName}: ${paramType}): ${returnType} {\n` +
    factoryLines.join("\n") +
    `\n  throw new Error(\`Unhandled case: \${${switchExpr}}\`);\n}`;

  fn.replaceWithText(newFnText);

  // Append base class and subclasses
  sf.addStatements(`\n${baseClass}\n\n${subclasses.join("\n\n")}`);

  return {
    success: true,
    filesChanged: [p.file],
    description: `Replaced switch in '${p.target}' with polymorphic class hierarchy (${subclasses.length} subclasses)`,
    diff: [],
  };
}

export const replaceConditionalWithPolymorphism: RefactoringDefinition = {
  name: "Replace Conditional With Polymorphism",
  kebabName: "replace-conditional-with-polymorphism",
  description:
    "Replaces a switch statement in a function with an abstract base class and concrete subclasses for each case.",
  tier: 2,
  params,
  preconditions: (project: Project, raw: unknown): PreconditionResult =>
    preconditions(project, params.validate(raw) as ReplaceConditionalWithPolymorphismParams),
  apply: (project: Project, raw: unknown): RefactoringResult =>
    apply(project, params.validate(raw) as ReplaceConditionalWithPolymorphismParams),
};
