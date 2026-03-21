import { SyntaxKind } from "ts-morph";
import type { Project } from "ts-morph";
import type {
  RefactoringDefinition,
  ParamSchema,
  PreconditionResult,
  RefactoringResult,
} from "../../engine/refactoring.types.js";

interface IntroduceSpecialCaseParams {
  file: string;
  target: string;
  specialValue: string;
  specialClassName: string;
}

const params: ParamSchema = {
  definitions: [
    { name: "file", type: "string", description: "Path to the TypeScript file", required: true },
    {
      name: "target",
      type: "string",
      description: "Name of the class to introduce a special case for",
      required: true,
    },
    {
      name: "specialValue",
      type: "string",
      description: "The special value that triggers special-case behaviour (e.g. 'unknown')",
      required: true,
    },
    {
      name: "specialClassName",
      type: "string",
      description: "Name for the new special-case subclass",
      required: true,
    },
  ],
  validate(raw: unknown): IntroduceSpecialCaseParams {
    const r = raw as Record<string, unknown>;
    if (typeof r["file"] !== "string" || r["file"].trim() === "") {
      throw new Error("param 'file' must be a non-empty string");
    }
    if (typeof r["target"] !== "string" || r["target"].trim() === "") {
      throw new Error("param 'target' must be a non-empty string");
    }
    if (typeof r["specialValue"] !== "string" || r["specialValue"].trim() === "") {
      throw new Error("param 'specialValue' must be a non-empty string");
    }
    if (typeof r["specialClassName"] !== "string" || r["specialClassName"].trim() === "") {
      throw new Error("param 'specialClassName' must be a non-empty string");
    }
    return {
      file: r["file"] as string,
      target: r["target"] as string,
      specialValue: r["specialValue"] as string,
      specialClassName: r["specialClassName"] as string,
    };
  },
};

function preconditions(project: Project, p: IntroduceSpecialCaseParams): PreconditionResult {
  const errors: string[] = [];

  const sf = project.getSourceFile(p.file);
  if (!sf) {
    errors.push(`File not found in project: ${p.file}`);
    return { ok: false, errors };
  }

  const cls = sf
    .getDescendantsOfKind(SyntaxKind.ClassDeclaration)
    .find((c) => c.getName() === p.target);

  if (!cls) {
    errors.push(`Class '${p.target}' not found in file: ${p.file}`);
    return { ok: false, errors };
  }

  const existing = sf
    .getDescendantsOfKind(SyntaxKind.ClassDeclaration)
    .find((c) => c.getName() === p.specialClassName);

  if (existing) {
    errors.push(`Class '${p.specialClassName}' already exists in file: ${p.file}`);
  }

  return { ok: errors.length === 0, errors };
}

function apply(project: Project, p: IntroduceSpecialCaseParams): RefactoringResult {
  const sf = project.getSourceFile(p.file);
  if (!sf) {
    return { success: false, filesChanged: [], description: `File not found: ${p.file}`, diff: [] };
  }

  const cls = sf
    .getDescendantsOfKind(SyntaxKind.ClassDeclaration)
    .find((c) => c.getName() === p.target);

  if (!cls) {
    return {
      success: false,
      filesChanged: [],
      description: `Class '${p.target}' not found`,
      diff: [],
    };
  }

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
      defaultReturn = `return "${p.specialValue}";`;
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
    `class ${p.specialClassName} extends ${p.target} {\n` +
    `  override get isSpecialCase(): boolean {\n    return true;\n  }\n` +
    (overridesText ? `\n${overridesText}\n` : "") +
    `}`;

  sf.addStatements(`\n${specialClassText}`);

  // Replace checks like `x === "${p.specialValue}"` with `x.isSpecialCase`
  const binaryExprs = sf.getDescendantsOfKind(SyntaxKind.BinaryExpression);
  for (const expr of binaryExprs) {
    const right = expr.getRight().getText();
    const operator = expr.getOperatorToken().getText();
    if ((operator === "===" || operator === "==") && right === `"${p.specialValue}"`) {
      expr.replaceWithText(`${expr.getLeft().getText()}.isSpecialCase`);
    }
  }

  return {
    success: true,
    filesChanged: [p.file],
    description: `Introduced special case class '${p.specialClassName}' for '${p.target}' with value '${p.specialValue}'`,
    diff: [],
  };
}

export const introduceSpecialCase: RefactoringDefinition = {
  name: "Introduce Special Case",
  kebabName: "introduce-special-case",
  description:
    "Introduces a special-case subclass to replace repeated conditional checks for a particular value.",
  tier: 2,
  params,
  preconditions: (project: Project, raw: unknown): PreconditionResult =>
    preconditions(project, params.validate(raw) as IntroduceSpecialCaseParams),
  apply: (project: Project, raw: unknown): RefactoringResult =>
    apply(project, params.validate(raw) as IntroduceSpecialCaseParams),
};
