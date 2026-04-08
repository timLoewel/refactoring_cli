import { Node, SyntaxKind } from "ts-morph";
import type { ClassDeclaration, SourceFile } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { defineRefactoring, enumerate, param, resolve } from "../../core/refactoring-builder.js";
import type { SourceFileContext } from "../../core/refactoring.types.js";

function buildGetterSetter(propName: string, propType: string): string {
  const capitalized = propName.charAt(0).toUpperCase() + propName.slice(1);
  return (
    `  get${capitalized}(): ${propType} { return this._${propName}; }\n` +
    `  set${capitalized}(value: ${propType}): void { this._${propName} = value; }`
  );
}

function encapsulateClassProperties(targetClass: ClassDeclaration, sf: SourceFile): number {
  const properties = targetClass.getProperties().filter((prop) => {
    const modifiers = prop.getModifiers().map((m) => m.getText());
    return !modifiers.includes("private") && !modifiers.includes("protected");
  });

  const encapsulatedNames = properties.map((p) => p.getName());

  let count = 0;
  for (const prop of properties) {
    const propName = prop.getName();
    const propType = prop.getTypeNode()?.getText() ?? "unknown";
    const initializer = prop.getInitializer()?.getText();

    prop.remove();

    targetClass.addProperty({
      name: `_${propName}`,
      type: propType,
      scope: undefined,
      initializer: initializer !== undefined ? initializer : undefined,
    });

    const getterSetter = buildGetterSetter(propName, propType);
    targetClass.addMember(getterSetter);
    count++;
  }

  // Update external access sites: obj.field → obj.getField() / obj.setField(value)
  for (const propName of encapsulatedNames) {
    const capitalized = propName.charAt(0).toUpperCase() + propName.slice(1);
    const accesses = sf
      .getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)
      .filter((pa) => pa.getName() === propName)
      .sort((a, b) => b.getStart() - a.getStart());

    for (const access of accesses) {
      // Skip accesses inside the class itself (this._field references)
      if (access.getFirstAncestorByKind(SyntaxKind.ClassDeclaration) === targetClass) continue;

      const parent = access.getParent();
      if (
        parent &&
        Node.isBinaryExpression(parent) &&
        parent.getOperatorToken().getKind() === SyntaxKind.EqualsToken &&
        parent.getLeft() === access
      ) {
        // Assignment: obj.field = value → obj.setField(value)
        const rhs = parent.getRight().getText();
        const objText = access.getExpression().getText();
        parent.replaceWithText(`${objText}.set${capitalized}(${rhs})`);
      } else {
        // Read: obj.field → obj.getField()
        const objText = access.getExpression().getText();
        access.replaceWithText(`${objText}.get${capitalized}()`);
      }
    }
  }

  return count;
}

export const encapsulateRecord = defineRefactoring<SourceFileContext>({
  name: "Encapsulate Record",
  kebabName: "encapsulate-record",
  tier: 3,
  description:
    "Wraps the public fields of a class with getter and setter methods, renaming fields with a leading underscore.",
  params: [
    param.file(),
    param.identifier("target", "Name of the plain-object variable or class to encapsulate"),
  ],
  resolve: (project, params) => resolve.sourceFile(project, params as { file: string }),
  preconditions(ctx: SourceFileContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const sf = ctx.sourceFile;
    const target = params["target"] as string;
    const file = params["file"] as string;

    const targetClass = sf
      .getDescendantsOfKind(SyntaxKind.ClassDeclaration)
      .find((c) => c.getName() === target);

    const targetVar = sf.getVariableDeclaration(target);

    if (!targetClass && !targetVar) {
      errors.push(`No class or variable named '${target}' found in file: ${file}`);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: SourceFileContext, params: Record<string, unknown>): RefactoringResult {
    const sf = ctx.sourceFile;
    const file = params["file"] as string;
    const target = params["target"] as string;

    const targetClass = sf
      .getDescendantsOfKind(SyntaxKind.ClassDeclaration)
      .find((c) => c.getName() === target);

    if (targetClass) {
      const count = encapsulateClassProperties(targetClass, sf);
      return {
        success: true,
        filesChanged: [file],
        description: `Encapsulated ${count} public field(s) in class '${target}' with getter/setter methods`,
      };
    }

    return {
      success: false,
      filesChanged: [],
      description: `Target '${target}' is not a class; only class encapsulation is supported`,
    };
  },
  enumerate: enumerate.variables,
});
