import { SyntaxKind } from "ts-morph";
import type { Project, ClassDeclaration } from "ts-morph";
import type {
  RefactoringDefinition,
  ParamSchema,
  PreconditionResult,
  RefactoringResult,
} from "../../engine/refactoring.types.js";

interface EncapsulateRecordParams {
  file: string;
  target: string;
}

const params: ParamSchema = {
  definitions: [
    { name: "file", type: "string", description: "Path to the TypeScript file", required: true },
    {
      name: "target",
      type: "string",
      description: "Name of the plain-object variable or class to encapsulate",
      required: true,
    },
  ],
  validate(raw: unknown): EncapsulateRecordParams {
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

function preconditions(project: Project, p: EncapsulateRecordParams): PreconditionResult {
  const errors: string[] = [];

  const sf = project.getSourceFile(p.file);
  if (!sf) {
    errors.push(`File not found in project: ${p.file}`);
    return { ok: false, errors };
  }

  const targetClass = sf
    .getDescendantsOfKind(SyntaxKind.ClassDeclaration)
    .find((c) => c.getName() === p.target);

  const targetVar = sf.getVariableDeclaration(p.target);

  if (!targetClass && !targetVar) {
    errors.push(`No class or variable named '${p.target}' found in file: ${p.file}`);
  }

  return { ok: errors.length === 0, errors };
}

function buildGetterSetter(propName: string, propType: string): string {
  const capitalized = propName.charAt(0).toUpperCase() + propName.slice(1);
  return (
    `  get${capitalized}(): ${propType} { return this._${propName}; }\n` +
    `  set${capitalized}(value: ${propType}): void { this._${propName} = value; }`
  );
}

function encapsulateClassProperties(targetClass: ClassDeclaration): number {
  const properties = targetClass.getProperties().filter((prop) => {
    const modifiers = prop.getModifiers().map((m) => m.getText());
    return !modifiers.includes("private") && !modifiers.includes("protected");
  });

  let count = 0;
  for (const prop of properties) {
    const propName = prop.getName();
    const propType = prop.getTypeNode()?.getText() ?? "unknown";
    const initializer = prop.getInitializer()?.getText();

    prop.remove();

    const initText = initializer !== undefined ? ` = ${initializer}` : "";
    targetClass.addProperty({
      name: `_${propName}`,
      type: propType,
      scope: undefined,
      initializer: initText !== "" ? initializer : undefined,
    });

    const getterSetter = buildGetterSetter(propName, propType);
    targetClass.addMember(getterSetter);
    count++;
  }
  return count;
}

function apply(project: Project, p: EncapsulateRecordParams): RefactoringResult {
  const sf = project.getSourceFile(p.file);
  if (!sf) {
    return { success: false, filesChanged: [], description: `File not found: ${p.file}` };
  }

  const targetClass = sf
    .getDescendantsOfKind(SyntaxKind.ClassDeclaration)
    .find((c) => c.getName() === p.target);

  if (targetClass) {
    const count = encapsulateClassProperties(targetClass);
    return {
      success: true,
      filesChanged: [p.file],
      description: `Encapsulated ${count} public field(s) in class '${p.target}' with getter/setter methods`,
    };
  }

  return {
    success: false,
    filesChanged: [],
    description: `Target '${p.target}' is not a class; only class encapsulation is supported`,
  };
}

export const encapsulateRecord: RefactoringDefinition = {
  name: "Encapsulate Record",
  kebabName: "encapsulate-record",
  description:
    "Wraps the public fields of a class with getter and setter methods, renaming fields with a leading underscore.",
  tier: 3,
  params,
  preconditions: (project: Project, raw: unknown): PreconditionResult =>
    preconditions(project, params.validate(raw) as EncapsulateRecordParams),
  apply: (project: Project, raw: unknown): RefactoringResult =>
    apply(project, params.validate(raw) as EncapsulateRecordParams),
};
