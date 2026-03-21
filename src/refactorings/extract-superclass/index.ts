import type { Project } from "ts-morph";
import type {
  RefactoringDefinition,
  ParamSchema,
  PreconditionResult,
  RefactoringResult,
} from "../../engine/refactoring.types.js";

interface ExtractSuperclassParams {
  file: string;
  target: string;
  methods: string;
  superclassName: string;
}

const params: ParamSchema = {
  definitions: [
    { name: "file", type: "string", description: "Path to the TypeScript file", required: true },
    {
      name: "target",
      type: "string",
      description: "Name of the class to extract from",
      required: true,
    },
    {
      name: "methods",
      type: "string",
      description: "Comma-separated method names to move to superclass",
      required: true,
    },
    {
      name: "superclassName",
      type: "string",
      description: "Name for the new superclass",
      required: true,
    },
  ],
  validate(raw: unknown): ExtractSuperclassParams {
    const r = raw as Record<string, unknown>;
    if (typeof r["file"] !== "string" || r["file"].trim() === "") {
      throw new Error("param 'file' must be a non-empty string");
    }
    if (typeof r["target"] !== "string" || r["target"].trim() === "") {
      throw new Error("param 'target' must be a non-empty string");
    }
    if (typeof r["methods"] !== "string" || r["methods"].trim() === "") {
      throw new Error("param 'methods' must be a non-empty string");
    }
    if (typeof r["superclassName"] !== "string" || r["superclassName"].trim() === "") {
      throw new Error("param 'superclassName' must be a non-empty string");
    }
    return {
      file: r["file"] as string,
      target: r["target"] as string,
      methods: r["methods"] as string,
      superclassName: r["superclassName"] as string,
    };
  },
};

function preconditions(project: Project, p: ExtractSuperclassParams): PreconditionResult {
  const errors: string[] = [];

  const sf = project.getSourceFile(p.file);
  if (!sf) {
    errors.push(`File not found in project: ${p.file}`);
    return { ok: false, errors };
  }

  const targetClass = sf.getClass(p.target);
  if (!targetClass) {
    errors.push(`Class '${p.target}' not found in file`);
    return { ok: false, errors };
  }

  if (sf.getClass(p.superclassName)) {
    errors.push(`Class '${p.superclassName}' already exists in file`);
  }

  const methodNames = p.methods
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  for (const methodName of methodNames) {
    if (!targetClass.getMethod(methodName)) {
      errors.push(`Method '${methodName}' not found in class '${p.target}'`);
    }
  }

  return { ok: errors.length === 0, errors };
}

function buildSuperclassText(superclassName: string, methodTexts: string[]): string {
  const body = methodTexts.map((m) => `  ${m}`).join("\n\n");
  return `class ${superclassName} {\n${body}\n}\n`;
}

function apply(project: Project, p: ExtractSuperclassParams): RefactoringResult {
  const sf = project.getSourceFile(p.file);
  if (!sf) {
    return { success: false, filesChanged: [], description: `File not found: ${p.file}`, diff: [] };
  }

  const targetClass = sf.getClass(p.target);
  if (!targetClass) {
    return {
      success: false,
      filesChanged: [],
      description: `Class '${p.target}' not found`,
      diff: [],
    };
  }

  const methodNames = p.methods
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  const methodTexts: string[] = [];

  for (const methodName of methodNames) {
    const method = targetClass.getMethod(methodName);
    if (method) {
      methodTexts.push(method.getText());
      method.remove();
    }
  }

  const superclassText = buildSuperclassText(p.superclassName, methodTexts);
  sf.insertText(0, superclassText + "\n");

  const updatedClass = sf.getClass(p.target);
  if (updatedClass) {
    const existing = updatedClass.getExtends();
    if (!existing) {
      updatedClass.setExtends(p.superclassName);
    }
  }

  return {
    success: true,
    filesChanged: [p.file],
    description: `Extracted methods [${methodNames.join(", ")}] from '${p.target}' into new superclass '${p.superclassName}'`,
    diff: [],
  };
}

export const extractSuperclass: RefactoringDefinition = {
  name: "Extract Superclass",
  kebabName: "extract-superclass",
  description:
    "Extracts shared methods from a class into a new superclass, making the original class extend it.",
  tier: 4,
  params,
  preconditions: (project: Project, raw: unknown): PreconditionResult =>
    preconditions(project, params.validate(raw) as ExtractSuperclassParams),
  apply: (project: Project, raw: unknown): RefactoringResult =>
    apply(project, params.validate(raw) as ExtractSuperclassParams),
};
