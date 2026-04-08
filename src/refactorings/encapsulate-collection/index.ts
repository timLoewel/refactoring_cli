import { Node, SyntaxKind } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { defineRefactoring, enumerate, param, resolve } from "../../core/refactoring-builder.js";
import type { ClassContext } from "../../core/refactoring.types.js";

function deriveElementType(collectionType: string): string {
  const arrayMatch = /Array<(.+)>/.exec(collectionType);
  if (arrayMatch) {
    return arrayMatch[1] ?? "unknown";
  }
  const shortMatch = /(.+)\[\]/.exec(collectionType);
  if (shortMatch) {
    return shortMatch[1] ?? "unknown";
  }
  return "unknown";
}

function buildCollectionMethods(
  fieldName: string,
  collectionType: string,
  elementType: string,
): string {
  const capitalized = fieldName.charAt(0).toUpperCase() + fieldName.slice(1);
  return (
    `  get${capitalized}(): ReadonlyArray<${elementType}> { return [...this._${fieldName}]; }\n` +
    `  add${capitalized}(item: ${elementType}): void { this._${fieldName}.push(item); }\n` +
    `  remove${capitalized}(item: ${elementType}): void {\n` +
    `    const index = this._${fieldName}.indexOf(item);\n` +
    `    if (index >= 0) { this._${fieldName}.splice(index, 1); }\n` +
    `  }`
  );
}

export const encapsulateCollection = defineRefactoring<ClassContext>({
  name: "Encapsulate Collection",
  kebabName: "encapsulate-collection",
  tier: 3,
  description:
    "Replaces direct access to a collection field with add, remove, and get methods that control mutation.",
  params: [
    param.file(),
    param.identifier("target", "Name of the class containing the collection field"),
    param.identifier("field", "Name of the collection field to encapsulate"),
  ],
  resolve: (project, params) => resolve.class(project, params as { file: string; target: string }),
  preconditions(ctx: ClassContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const field = params["field"] as string;
    const { cls } = ctx;

    const prop = cls.getProperty(field);
    if (!prop) {
      errors.push(`Field '${field}' not found on class '${params["target"] as string}'`);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: ClassContext, params: Record<string, unknown>): RefactoringResult {
    const file = params["file"] as string;
    const target = params["target"] as string;
    const field = params["field"] as string;
    const { cls: targetClass } = ctx;

    const prop = targetClass.getProperty(field);
    if (!prop) {
      return {
        success: false,
        filesChanged: [],
        description: `Field '${field}' not found on class '${target}'`,
      };
    }

    const collectionType = prop.getTypeNode()?.getText() ?? "unknown[]";
    const initializer = prop.getInitializer()?.getText() ?? "[]";
    const elementType = deriveElementType(collectionType);

    prop.remove();

    targetClass.addProperty({
      name: `_${field}`,
      type: collectionType,
      initializer,
    });

    const methods = buildCollectionMethods(field, collectionType, elementType);
    targetClass.addMember(methods);

    // Rewrite external access sites
    const capitalized = field.charAt(0).toUpperCase() + field.slice(1);
    const sf = ctx.sourceFile;
    const accesses = sf
      .getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)
      .filter((pa) => pa.getName() === field)
      .filter((pa) => pa.getFirstAncestorByKind(SyntaxKind.ClassDeclaration) !== targetClass)
      .sort((a, b) => b.getStart() - a.getStart());

    for (const access of accesses) {
      const parent = access.getParent();
      const objText = access.getExpression().getText();

      // obj.field.push(item) → obj.addField(item)
      if (parent && Node.isPropertyAccessExpression(parent) && parent.getName() === "push") {
        const call = parent.getParent();
        if (call && Node.isCallExpression(call) && call.getExpression() === parent) {
          const args = call
            .getArguments()
            .map((a) => a.getText())
            .join(", ");
          call.replaceWithText(`${objText}.add${capitalized}(${args})`);
          continue;
        }
      }

      // obj.field (any other read) → obj.getField()
      access.replaceWithText(`${objText}.get${capitalized}()`);
    }

    return {
      success: true,
      filesChanged: [file],
      description: `Encapsulated collection field '${field}' on '${target}' with add/remove/get methods`,
    };
  },
  enumerate: enumerate.classes,
});
