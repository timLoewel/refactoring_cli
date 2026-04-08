import { SyntaxKind } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { defineRefactoring, enumerate, param, resolve } from "../../core/refactoring-builder.js";
import type { ClassContext } from "../../core/refactoring.types.js";

export const introduceSpecialCase = defineRefactoring<ClassContext>({
  name: "Introduce Special Case",
  kebabName: "introduce-special-case",
  tier: 2,
  description:
    "Introduces a special-case subclass to replace repeated conditional checks for a particular value.",
  params: [
    param.file(),
    param.identifier("target", "Name of the class to introduce a special case for"),
    param.string(
      "specialValue",
      "The special value that triggers special-case behaviour (e.g. 'unknown')",
    ),
    param.identifier("specialClassName", "Name for the new special-case subclass"),
  ],
  resolve: (project, params) => resolve.class(project, params as { file: string; target: string }),
  preconditions(ctx: ClassContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const sf = ctx.sourceFile;
    const specialClassName = params["specialClassName"] as string;

    const existing = sf
      .getDescendantsOfKind(SyntaxKind.ClassDeclaration)
      .find((c) => c.getName() === specialClassName);

    if (existing) {
      errors.push(`Class '${specialClassName}' already exists in file`);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: ClassContext, params: Record<string, unknown>): RefactoringResult {
    const sf = ctx.sourceFile;
    const file = params["file"] as string;
    const target = params["target"] as string;
    const specialValue = params["specialValue"] as string;
    const specialClassName = params["specialClassName"] as string;
    const { cls } = ctx;

    // Collect public methods to override in the special case
    const methods = cls.getMethods().filter((m) => {
      const modifiers = m.getModifiers().map((mod) => mod.getText());
      return !modifiers.includes("private") && !modifiers.includes("protected");
    });

    // Build method overrides that represent the special-case behaviour
    const methodOverrides = methods.map((m) => {
      const name = m.getName();
      const returnTypeNode = m.getReturnTypeNode();
      const returnType = returnTypeNode ? returnTypeNode.getText() : "unknown";
      const paramList = m
        .getParameters()
        .map((param) => {
          const typeNode = param.getTypeNode();
          return `${param.getName()}${param.hasQuestionToken() ? "?" : ""}: ${typeNode ? typeNode.getText() : "unknown"}`;
        })
        .join(", ");

      // For the special case, return a sensible default based on return type
      let defaultReturn: string;
      if (returnType === "string") {
        defaultReturn = `return "${specialValue}";`;
      } else if (returnType === "number") {
        defaultReturn = `return 0;`;
      } else if (returnType === "boolean") {
        defaultReturn = `return false;`;
      } else {
        defaultReturn = `return null as unknown as ${returnType};`;
      }

      return `  ${name}(${paramList}): ${returnType} {\n    ${defaultReturn}\n  }`;
    });

    // Add isSpecialCase getter to base class
    const isSpecialCaseGetter = `  get isSpecialCase(): boolean {\n    return false;\n  }`;
    cls.addMember(isSpecialCaseGetter);

    // Build the special-case subclass
    const overridesText = methodOverrides.join("\n\n");
    const specialClassText =
      `class ${specialClassName} extends ${target} {\n` +
      `  override get isSpecialCase(): boolean {\n    return true;\n  }\n` +
      (overridesText ? `\n${overridesText}\n` : "") +
      `}`;

    sf.addStatements(`\n${specialClassText}`);

    // Replace checks like `obj.getName() === "${specialValue}"` with `obj.isSpecialCase`
    const binaryExprs = sf.getDescendantsOfKind(SyntaxKind.BinaryExpression);
    for (const expr of binaryExprs) {
      const right = expr.getRight().getText();
      const operator = expr.getOperatorToken().getText();
      if ((operator === "===" || operator === "==") && right === `"${specialValue}"`) {
        const left = expr.getLeft();
        // Walk through call expressions and property accesses to find the receiver object
        let receiver = left;
        if (receiver.isKind(SyntaxKind.CallExpression)) {
          receiver = receiver.getExpression();
        }
        if (receiver.isKind(SyntaxKind.PropertyAccessExpression)) {
          receiver = receiver.getExpression();
        }
        expr.replaceWithText(`${receiver.getText()}.isSpecialCase`);
      }
    }

    return {
      success: true,
      filesChanged: [file],
      description: `Introduced special case class '${specialClassName}' for '${target}' with value '${specialValue}'`,
    };
  },
  enumerate: enumerate.classes,
});
