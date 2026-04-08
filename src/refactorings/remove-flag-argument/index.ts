import { SyntaxKind, Node } from "ts-morph";
import type { FunctionDeclaration } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { defineRefactoring, enumerate, param, resolve } from "../../core/refactoring-builder.js";
import type { FunctionContext } from "../../core/refactoring.types.js";

/** Extract body text with flag identifier references replaced by a literal value. */
function getBodyWithFlagReplaced(
  fn: FunctionDeclaration,
  flag: string,
  replacement: string,
): string {
  // Work on the AST: find identifiers in the body matching the flag
  const body = fn.getBody();
  if (!body || !Node.isBlock(body)) return "{}";

  // We clone by working with the body text — but we need precise identifier replacement.
  // Instead of regex, extract identifier positions relative to the body and replace them.
  const bodyStart = body.getStart();
  let bodyText = body.getText();
  const identifiers = body.getDescendantsOfKind(SyntaxKind.Identifier);
  // Sort from end to start so replacements don't shift positions
  const sorted = [...identifiers].sort((a, b) => b.getStart() - a.getStart());
  for (const id of sorted) {
    if (id.getText() !== flag) continue;
    const parent = id.getParent();
    if (Node.isPropertyAccessExpression(parent) && parent.getNameNode() === id) continue;
    const relStart = id.getStart() - bodyStart;
    const relEnd = id.getEnd() - bodyStart;
    bodyText = bodyText.slice(0, relStart) + replacement + bodyText.slice(relEnd);
  }
  return bodyText;
}

export const removeFlagArgument = defineRefactoring<FunctionContext>({
  name: "Remove Flag Argument",
  kebabName: "remove-flag-argument",
  tier: 2,
  description: "Splits a function that accepts a boolean flag into two specialized functions.",
  params: [
    param.file(),
    param.identifier("target", "Name of the function with the flag argument"),
    param.identifier("flag", "Name of the boolean flag parameter to remove"),
  ],
  resolve: (project, params) =>
    resolve.function(project, params as { file: string; target: string }),
  preconditions(ctx: FunctionContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const flag = params["flag"] as string;

    const flagParam = ctx.fn.getParameters().find((param) => param.getName() === flag);
    if (!flagParam) {
      errors.push(`Parameter '${flag}' not found in function '${ctx.fn.getName()}'`);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: FunctionContext, params: Record<string, unknown>): RefactoringResult {
    const sf = ctx.sourceFile;
    const file = params["file"] as string;
    const target = params["target"] as string;
    const flag = params["flag"] as string;
    const { fn } = ctx;

    const parameters = fn.getParameters();
    const flagIndex = parameters.findIndex((param) => param.getName() === flag);
    if (flagIndex === -1) {
      return {
        success: false,
        filesChanged: [],
        description: `Parameter '${flag}' not found in function '${target}'`,
      };
    }

    const trueName = `${target}WhenTrue`;
    const falseName = `${target}WhenFalse`;

    // Preserve the original return type
    const returnTypeNode = fn.getReturnTypeNode();
    const returnType = returnTypeNode ? returnTypeNode.getText() : "void";

    // Build parameter list without the flag
    const otherParams = parameters
      .filter((_, i) => i !== flagIndex)
      .map((par) => par.getText())
      .join(", ");

    // Replace flag identifier references in body with literal true/false (AST-aware, not regex)
    const trueBody = getBodyWithFlagReplaced(fn, flag, "true");
    const falseBody = getBodyWithFlagReplaced(fn, flag, "false");

    // Build two new functions — callers can specialize them further
    const trueFunc = `\nfunction ${trueName}(${otherParams}): ${returnType} ${trueBody}\n`;
    const falseFunc = `\nfunction ${falseName}(${otherParams}): ${returnType} ${falseBody}\n`;

    // Update call sites: replace calls with flag=true/false with the appropriate variant
    const calls = sf.getDescendantsOfKind(SyntaxKind.CallExpression).filter((c) => {
      return c.getExpression().getText() === target;
    });

    const sortedCalls = [...calls].sort((a, b) => b.getStart() - a.getStart());
    for (const call of sortedCalls) {
      const args = call.getArguments();
      const flagArg = args[flagIndex];
      const flagValue = flagArg ? flagArg.getText() : "true";
      const newName = flagValue === "false" ? falseName : trueName;
      const newArgs = args.filter((_, i) => i !== flagIndex).map((a) => a.getText());
      call.replaceWithText(`${newName}(${newArgs.join(", ")})`);
    }

    // Remove original function and add two specialized ones
    fn.remove();
    sf.addStatements(trueFunc);
    sf.addStatements(falseFunc);

    return {
      success: true,
      filesChanged: [file],
      description: `Split function '${target}' on flag '${flag}' into '${trueName}' and '${falseName}'`,
    };
  },
  enumerate: enumerate.functions,
});
