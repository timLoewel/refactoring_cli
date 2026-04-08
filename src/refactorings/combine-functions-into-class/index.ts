import { Node, SyntaxKind } from "ts-morph";
import type { FunctionDeclaration } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { defineRefactoring, enumerate, param, resolve } from "../../core/refactoring-builder.js";
import type { SourceFileContext } from "../../core/refactoring.types.js";

function convertFunctionToStaticMethod(functionText: string): string {
  return "static " + functionText.replace(/^(export\s+)?function\s+/, "").trim();
}

/** Find all call expression identifiers that reference one of the moved functions. */
function findCallSites(fn: FunctionDeclaration): { id: Node; name: string }[] {
  const sf = fn.getSourceFile();
  const name = fn.getName();
  if (!name) return [];
  const results: { id: Node; name: string }[] = [];
  for (const id of sf.getDescendantsOfKind(SyntaxKind.Identifier)) {
    if (id.getText() !== name) continue;
    const parent = id.getParent();
    // Skip the function declaration's own name node
    if (Node.isFunctionDeclaration(parent) && parent.getNameNode() === id) continue;
    // Only include call expressions or references outside the moved functions
    results.push({ id, name });
  }
  return results;
}

export const combineFunctionsIntoClass = defineRefactoring<SourceFileContext>({
  name: "Combine Functions Into Class",
  kebabName: "combine-functions-into-class",
  tier: 3,
  description: "Groups a set of related top-level functions into a new class as methods.",
  params: [
    param.file(),
    param.string("target", "Comma-separated names of the functions to group into a class"),
    param.identifier("className", "Name for the new class"),
  ],
  resolve: (project, params) => resolve.sourceFile(project, params as { file: string }),
  preconditions(ctx: SourceFileContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const sf = ctx.sourceFile;
    const target = params["target"] as string;
    const className = params["className"] as string;
    const file = params["file"] as string;

    const existing = sf
      .getDescendantsOfKind(SyntaxKind.ClassDeclaration)
      .find((c) => c.getName() === className);
    if (existing) {
      errors.push(`Class '${className}' already exists in file`);
    }

    const functionNames = target
      .split(",")
      .map((name) => name.trim())
      .filter((name) => name.length > 0);
    for (const functionName of functionNames) {
      const found = sf
        .getDescendantsOfKind(SyntaxKind.FunctionDeclaration)
        .find((f) => f.getName() === functionName);
      if (!found) {
        errors.push(`Function '${functionName}' not found in file: ${file}`);
      }
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: SourceFileContext, params: Record<string, unknown>): RefactoringResult {
    const sf = ctx.sourceFile;
    const file = params["file"] as string;
    const target = params["target"] as string;
    const className = params["className"] as string;

    const functionNames = target
      .split(",")
      .map((name) => name.trim())
      .filter((name) => name.length > 0);

    const allDeclarations = sf.getDescendantsOfKind(SyntaxKind.FunctionDeclaration);
    const functionsToMove = functionNames
      .map((name) => allDeclarations.find((f) => f.getName() === name))
      .filter((f): f is NonNullable<typeof f> => f !== undefined);

    if (functionsToMove.length === 0) {
      return {
        success: false,
        filesChanged: [],
        description: "No matching functions found",
      };
    }

    // Collect call sites before mutations
    const allCallSites: { id: Node; name: string }[] = [];
    for (const fn of functionsToMove) {
      allCallSites.push(...findCallSites(fn));
    }

    // Update call sites: foo(args) → ClassName.foo(args) (reverse order to preserve positions)
    const sortedCallSites = [...allCallSites].sort((a, b) => b.id.getStart() - a.id.getStart());
    for (const site of sortedCallSites) {
      try {
        site.id.replaceWithText(`${className}.${site.name}`);
      } catch {
        // Skip if replacement fails (e.g., node already removed)
      }
    }

    // Capture method texts AFTER call site updates so bodies contain qualified references
    const methodTexts = functionsToMove.map((fn) => convertFunctionToStaticMethod(fn.getText()));

    // Remove original function declarations
    const sorted = [...functionsToMove].sort((a, b) => b.getStart() - a.getStart());
    for (const fn of sorted) {
      fn.remove();
    }

    const methodsBody = methodTexts.map((m) => `  ${m}`).join("\n\n  ");
    sf.addStatements(`\nclass ${className} {\n  ${methodsBody}\n}\n`);

    return {
      success: true,
      filesChanged: [file],
      description: `Combined functions [${functionNames.join(", ")}] into new class '${className}'`,
    };
  },
  enumerate: enumerate.variablesAndFunctions,
});
