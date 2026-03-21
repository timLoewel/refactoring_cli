import { SyntaxKind } from "ts-morph";
import type { Project } from "ts-morph";
import type {
  RefactoringDefinition,
  ParamSchema,
  PreconditionResult,
  RefactoringResult,
} from "../../engine/refactoring.types.js";

interface CombineFunctionsIntoClassParams {
  file: string;
  target: string;
  className: string;
}

const params: ParamSchema = {
  definitions: [
    { name: "file", type: "string", description: "Path to the TypeScript file", required: true },
    {
      name: "target",
      type: "string",
      description: "Comma-separated names of the functions to group into a class",
      required: true,
    },
    {
      name: "className",
      type: "string",
      description: "Name for the new class",
      required: true,
    },
  ],
  validate(raw: unknown): CombineFunctionsIntoClassParams {
    const r = raw as Record<string, unknown>;
    if (typeof r["file"] !== "string" || r["file"].trim() === "") {
      throw new Error("param 'file' must be a non-empty string");
    }
    if (typeof r["target"] !== "string" || r["target"].trim() === "") {
      throw new Error("param 'target' must be a non-empty string");
    }
    if (typeof r["className"] !== "string" || r["className"].trim() === "") {
      throw new Error("param 'className' must be a non-empty string");
    }
    return {
      file: r["file"] as string,
      target: r["target"] as string,
      className: r["className"] as string,
    };
  },
};

function preconditions(project: Project, p: CombineFunctionsIntoClassParams): PreconditionResult {
  const errors: string[] = [];

  const sf = project.getSourceFile(p.file);
  if (!sf) {
    errors.push(`File not found in project: ${p.file}`);
    return { ok: false, errors };
  }

  const existing = sf
    .getDescendantsOfKind(SyntaxKind.ClassDeclaration)
    .find((c) => c.getName() === p.className);
  if (existing) {
    errors.push(`Class '${p.className}' already exists in file`);
  }

  const functionNames = p.target
    .split(",")
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
  for (const functionName of functionNames) {
    const found = sf
      .getDescendantsOfKind(SyntaxKind.FunctionDeclaration)
      .find((f) => f.getName() === functionName);
    if (!found) {
      errors.push(`Function '${functionName}' not found in file: ${p.file}`);
    }
  }

  return { ok: errors.length === 0, errors };
}

function convertFunctionToMethod(functionText: string, _functionName: string): string {
  // Strip the 'function' keyword and leading/trailing whitespace
  return functionText.replace(/^(export\s+)?function\s+/, "").trim();
}

function apply(project: Project, p: CombineFunctionsIntoClassParams): RefactoringResult {
  const sf = project.getSourceFile(p.file);
  if (!sf) {
    return { success: false, filesChanged: [], description: `File not found: ${p.file}`, diff: [] };
  }

  const functionNames = p.target
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
      diff: [],
    };
  }

  const methodTexts = functionsToMove.map((fn) =>
    convertFunctionToMethod(fn.getText(), fn.getName() ?? ""),
  );

  // Remove original functions in reverse order
  const sorted = [...functionsToMove].sort((a, b) => b.getStart() - a.getStart());
  for (const fn of sorted) {
    fn.remove();
  }

  const methodsBody = methodTexts.map((m) => `  ${m}`).join("\n\n  ");
  sf.addStatements(`\nclass ${p.className} {\n  ${methodsBody}\n}\n`);

  return {
    success: true,
    filesChanged: [p.file],
    description: `Combined functions [${functionNames.join(", ")}] into new class '${p.className}'`,
    diff: [],
  };
}

export const combineFunctionsIntoClass: RefactoringDefinition = {
  name: "Combine Functions Into Class",
  kebabName: "combine-functions-into-class",
  description: "Groups a set of related top-level functions into a new class as methods.",
  tier: 3,
  params,
  preconditions: (project: Project, raw: unknown): PreconditionResult =>
    preconditions(project, params.validate(raw) as CombineFunctionsIntoClassParams),
  apply: (project: Project, raw: unknown): RefactoringResult =>
    apply(project, params.validate(raw) as CombineFunctionsIntoClassParams),
};
