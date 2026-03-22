import { SyntaxKind } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../engine/refactoring.types.js";
import {
  defineRefactoring,
  fileParam,
  identifierParam,
  resolveFunction,
} from "../../engine/refactoring-builder.js";
import type { FunctionContext } from "../../engine/refactoring-builder.js";

export const replaceConditionalWithPolymorphism = defineRefactoring<FunctionContext>({
  name: "Replace Conditional With Polymorphism",
  kebabName: "replace-conditional-with-polymorphism",
  tier: 2,
  description:
    "Replaces a switch statement in a function with an abstract base class and concrete subclasses for each case.",
  params: [
    fileParam(),
    identifierParam("target", "Name of the function containing a switch statement to replace"),
  ],
  resolve: (project, params) =>
    resolveFunction(project, params as { file: string; target: string }),
  preconditions(ctx: FunctionContext): PreconditionResult {
    const errors: string[] = [];
    const { fn, body } = ctx;

    const switchStmts = body.getDescendantsOfKind(SyntaxKind.SwitchStatement);
    if (switchStmts.length === 0) {
      errors.push(`Function '${fn.getName()}' contains no switch statement`);
      return { ok: false, errors };
    }

    const switchStmt = switchStmts[0];
    if (!switchStmt) {
      errors.push(`No switch statement found in '${fn.getName()}'`);
      return { ok: false, errors };
    }
    const cases = switchStmt
      .getCaseBlock()
      .getClauses()
      .filter((c) => c.getKind() === SyntaxKind.CaseClause);
    if (cases.length < 2) {
      errors.push(`Switch in '${fn.getName()}' needs at least 2 case clauses to apply polymorphism`);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: FunctionContext, params: Record<string, unknown>): RefactoringResult {
    const sf = ctx.sourceFile;
    const file = params["file"] as string;
    const target = params["target"] as string;
    const { fn, body } = ctx;

    const switchStmts = body.getDescendantsOfKind(SyntaxKind.SwitchStatement);
    if (switchStmts.length === 0) {
      return {
        success: false,
        filesChanged: [],
        description: `No switch statement found in '${target}'`,
      };
    }

    const switchStmt = switchStmts[0];
    if (!switchStmt) {
      return {
        success: false,
        filesChanged: [],
        description: `No switch statement found in '${target}'`,
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
    const baseName = `${target.charAt(0).toUpperCase()}${target.slice(1)}Base`;
    const methodName = target;

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
      `function ${target}(${paramName}: ${paramType}): ${returnType} {\n` +
      factoryLines.join("\n") +
      `\n  throw new Error(\`Unhandled case: \${${switchExpr}}\`);\n}`;

    fn.replaceWithText(newFnText);

    // Append base class and subclasses
    sf.addStatements(`\n${baseClass}\n\n${subclasses.join("\n\n")}`);

    return {
      success: true,
      filesChanged: [file],
      description: `Replaced switch in '${target}' with polymorphic class hierarchy (${subclasses.length} subclasses)`,
    };
  },
});
