import { SyntaxKind } from "ts-morph";
import type { Project } from "ts-morph";
import type {
  RefactoringDefinition,
  ParamSchema,
  PreconditionResult,
  RefactoringResult,
} from "../../engine/refactoring.types.js";

interface ExtractFunctionParams {
  file: string;
  startLine: number;
  endLine: number;
  name: string;
}

const params: ParamSchema = {
  definitions: [
    { name: "file", type: "string", description: "Path to the TypeScript file", required: true },
    {
      name: "startLine",
      type: "number",
      description: "First line of code to extract (1-based)",
      required: true,
    },
    {
      name: "endLine",
      type: "number",
      description: "Last line of code to extract (1-based)",
      required: true,
    },
    {
      name: "name",
      type: "string",
      description: "Name for the extracted function",
      required: true,
    },
  ],
  validate(raw: unknown): ExtractFunctionParams {
    const r = raw as Record<string, unknown>;
    if (typeof r["file"] !== "string" || r["file"].trim() === "") {
      throw new Error("param 'file' must be a non-empty string");
    }
    const startLine = Number(r["startLine"]);
    if (!Number.isInteger(startLine) || startLine < 1) {
      throw new Error("param 'startLine' must be a positive integer");
    }
    const endLine = Number(r["endLine"]);
    if (!Number.isInteger(endLine) || endLine < 1) {
      throw new Error("param 'endLine' must be a positive integer");
    }
    if (endLine < startLine) {
      throw new Error("param 'endLine' must be >= 'startLine'");
    }
    if (typeof r["name"] !== "string" || r["name"].trim() === "") {
      throw new Error("param 'name' must be a non-empty string");
    }
    return {
      file: r["file"] as string,
      startLine,
      endLine,
      name: r["name"] as string,
    };
  },
};

function preconditions(project: Project, p: ExtractFunctionParams): PreconditionResult {
  const errors: string[] = [];

  const sf = project.getSourceFile(p.file);
  if (!sf) {
    errors.push(`File not found in project: ${p.file}`);
    return { ok: false, errors };
  }

  const totalLines = sf.getEndLineNumber();
  if (p.startLine > totalLines) {
    errors.push(`startLine ${p.startLine} exceeds file length ${totalLines}`);
  }
  if (p.endLine > totalLines) {
    errors.push(`endLine ${p.endLine} exceeds file length ${totalLines}`);
  }

  const existing = sf
    .getDescendantsOfKind(SyntaxKind.FunctionDeclaration)
    .find((f) => f.getName() === p.name);
  if (existing) {
    errors.push(`A function named '${p.name}' already exists in the file`);
  }

  return { ok: errors.length === 0, errors };
}

function apply(project: Project, p: ExtractFunctionParams): RefactoringResult {
  const sf = project.getSourceFile(p.file);
  if (!sf) {
    return { success: false, filesChanged: [], description: `File not found: ${p.file}` };
  }

  // Collect statements whose lines fall within [startLine, endLine]
  const statements = sf.getStatements();
  const toExtract = statements.filter((s) => {
    const start = s.getStartLineNumber();
    const end = s.getEndLineNumber();
    return start >= p.startLine && end <= p.endLine;
  });

  if (toExtract.length === 0) {
    return {
      success: false,
      filesChanged: [],
      description: `No complete statements found between lines ${p.startLine} and ${p.endLine}`,
    };
  }

  const bodyText = toExtract.map((s) => `  ${s.getText()}`).join("\n");
  const functionText = `\nfunction ${p.name}(): void {\n${bodyText}\n}\n`;

  // Remove extracted statements (in reverse order to preserve positions)
  const sorted = [...toExtract].sort((a, b) => b.getStart() - a.getStart());
  for (const stmt of sorted) {
    stmt.remove();
  }

  // Insert call to the new function at the position of the first removed statement
  const firstToExtract = toExtract[0];
  const firstIndex = firstToExtract ? statements.indexOf(firstToExtract) : -1;
  const insertIndex = firstIndex >= 0 ? firstIndex : 0;
  sf.insertStatements(insertIndex, `${p.name}();`);

  // Append function declaration at end of file
  sf.addStatements(functionText);

  return {
    success: true,
    filesChanged: [p.file],
    description: `Extracted lines ${p.startLine}-${p.endLine} into function '${p.name}'`,
  };
}

export const extractFunction: RefactoringDefinition = {
  name: "Extract Function",
  kebabName: "extract-function",
  description:
    "Extracts a range of lines into a new named function and replaces them with a call to it.",
  tier: 2,
  params,
  preconditions: (project: Project, raw: unknown): PreconditionResult =>
    preconditions(project, params.validate(raw) as ExtractFunctionParams),
  apply: (project: Project, raw: unknown): RefactoringResult =>
    apply(project, params.validate(raw) as ExtractFunctionParams),
};
