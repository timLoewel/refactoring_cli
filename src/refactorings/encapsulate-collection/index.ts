import { SyntaxKind } from "ts-morph";
import type { Project } from "ts-morph";
import type {
  RefactoringDefinition,
  ParamSchema,
  PreconditionResult,
  RefactoringResult,
} from "../../engine/refactoring.types.js";

interface EncapsulateCollectionParams {
  file: string;
  target: string;
  field: string;
}

const params: ParamSchema = {
  definitions: [
    { name: "file", type: "string", description: "Path to the TypeScript file", required: true },
    {
      name: "target",
      type: "string",
      description: "Name of the class containing the collection field",
      required: true,
    },
    {
      name: "field",
      type: "string",
      description: "Name of the collection field to encapsulate",
      required: true,
    },
  ],
  validate(raw: unknown): EncapsulateCollectionParams {
    const r = raw as Record<string, unknown>;
    if (typeof r["file"] !== "string" || r["file"].trim() === "") {
      throw new Error("param 'file' must be a non-empty string");
    }
    if (typeof r["target"] !== "string" || r["target"].trim() === "") {
      throw new Error("param 'target' must be a non-empty string");
    }
    if (typeof r["field"] !== "string" || r["field"].trim() === "") {
      throw new Error("param 'field' must be a non-empty string");
    }
    return {
      file: r["file"] as string,
      target: r["target"] as string,
      field: r["field"] as string,
    };
  },
};

function preconditions(project: Project, p: EncapsulateCollectionParams): PreconditionResult {
  const errors: string[] = [];

  const sf = project.getSourceFile(p.file);
  if (!sf) {
    errors.push(`File not found in project: ${p.file}`);
    return { ok: false, errors };
  }

  const targetClass = sf
    .getDescendantsOfKind(SyntaxKind.ClassDeclaration)
    .find((c) => c.getName() === p.target);
  if (!targetClass) {
    errors.push(`Class '${p.target}' not found in file: ${p.file}`);
    return { ok: false, errors };
  }

  const prop = targetClass.getProperty(p.field);
  if (!prop) {
    errors.push(`Field '${p.field}' not found on class '${p.target}'`);
  }

  return { ok: errors.length === 0, errors };
}

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

function apply(project: Project, p: EncapsulateCollectionParams): RefactoringResult {
  const sf = project.getSourceFile(p.file);
  if (!sf) {
    return { success: false, filesChanged: [], description: `File not found: ${p.file}` };
  }

  const targetClass = sf
    .getDescendantsOfKind(SyntaxKind.ClassDeclaration)
    .find((c) => c.getName() === p.target);
  if (!targetClass) {
    return {
      success: false,
      filesChanged: [],
      description: `Class '${p.target}' not found`,
    };
  }

  const prop = targetClass.getProperty(p.field);
  if (!prop) {
    return {
      success: false,
      filesChanged: [],
      description: `Field '${p.field}' not found on class '${p.target}'`,
    };
  }

  const collectionType = prop.getTypeNode()?.getText() ?? "unknown[]";
  const initializer = prop.getInitializer()?.getText() ?? "[]";
  const elementType = deriveElementType(collectionType);

  prop.remove();

  targetClass.addProperty({
    name: `_${p.field}`,
    type: collectionType,
    initializer,
  });

  const methods = buildCollectionMethods(p.field, collectionType, elementType);
  targetClass.addMember(methods);

  return {
    success: true,
    filesChanged: [p.file],
    description: `Encapsulated collection field '${p.field}' on '${p.target}' with add/remove/get methods`,
  };
}

export const encapsulateCollection: RefactoringDefinition = {
  name: "Encapsulate Collection",
  kebabName: "encapsulate-collection",
  description:
    "Replaces direct access to a collection field with add, remove, and get methods that control mutation.",
  tier: 3,
  params,
  preconditions: (project: Project, raw: unknown): PreconditionResult =>
    preconditions(project, params.validate(raw) as EncapsulateCollectionParams),
  apply: (project: Project, raw: unknown): RefactoringResult =>
    apply(project, params.validate(raw) as EncapsulateCollectionParams),
};
