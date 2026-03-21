import type { Project } from "ts-morph";
import type {
  RefactoringDefinition,
  ParamSchema,
  PreconditionResult,
  RefactoringResult,
} from "../../engine/refactoring.types.js";

interface ReplaceInlineCodeWithFunctionCallParams {
  file: string;
  target: string;
  name: string;
}

const params: ParamSchema = {
  definitions: [
    { name: "file", type: "string", description: "Path to the TypeScript file", required: true },
    {
      name: "target",
      type: "string",
      description: "Inline code expression to replace",
      required: true,
    },
    {
      name: "name",
      type: "string",
      description: "Name of the function to call instead",
      required: true,
    },
  ],
  validate(raw: unknown): ReplaceInlineCodeWithFunctionCallParams {
    const r = raw as Record<string, unknown>;
    if (typeof r["file"] !== "string" || r["file"].trim() === "") {
      throw new Error("param 'file' must be a non-empty string");
    }
    if (typeof r["target"] !== "string" || r["target"].trim() === "") {
      throw new Error("param 'target' must be a non-empty string");
    }
    if (typeof r["name"] !== "string" || r["name"].trim() === "") {
      throw new Error("param 'name' must be a non-empty string");
    }
    return {
      file: r["file"] as string,
      target: r["target"] as string,
      name: r["name"] as string,
    };
  },
};

function preconditions(
  project: Project,
  p: ReplaceInlineCodeWithFunctionCallParams,
): PreconditionResult {
  const errors: string[] = [];

  const sf = project.getSourceFile(p.file);
  if (!sf) {
    errors.push(`File not found in project: ${p.file}`);
    return { ok: false, errors };
  }

  const text = sf.getFullText();
  if (!text.includes(p.target)) {
    errors.push(`Inline code '${p.target}' not found in file: ${p.file}`);
  }

  return { ok: errors.length === 0, errors };
}

function apply(project: Project, p: ReplaceInlineCodeWithFunctionCallParams): RefactoringResult {
  const sf = project.getSourceFile(p.file);
  if (!sf) {
    return { success: false, filesChanged: [], description: `File not found: ${p.file}`, diff: [] };
  }

  // Find all expression nodes whose text matches the target
  const allNodes = sf.getDescendants();
  const matches = allNodes.filter((node) => node.getText() === p.target);
  const sorted = [...matches].sort((a, b) => b.getStart() - a.getStart());

  let replacements = 0;
  for (const node of sorted) {
    node.replaceWithText(`${p.name}()`);
    replacements++;
  }

  if (replacements === 0) {
    // Fall back to raw text replacement
    const fullText = sf.getFullText();
    const newText = fullText.split(p.target).join(`${p.name}()`);
    sf.replaceWithText(newText);
    replacements = (
      fullText.match(new RegExp(p.target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) ?? []
    ).length;
  }

  return {
    success: true,
    filesChanged: [p.file],
    description: `Replaced ${replacements} occurrence(s) of inline code with call to '${p.name}()'`,
    diff: [],
  };
}

export const replaceInlineCodeWithFunctionCall: RefactoringDefinition = {
  name: "Replace Inline Code With Function Call",
  kebabName: "replace-inline-code-with-function-call",
  description: "Replaces occurrences of an inline expression with a call to a named function.",
  tier: 2,
  params,
  preconditions: (project: Project, raw: unknown): PreconditionResult =>
    preconditions(project, params.validate(raw) as ReplaceInlineCodeWithFunctionCallParams),
  apply: (project: Project, raw: unknown): RefactoringResult =>
    apply(project, params.validate(raw) as ReplaceInlineCodeWithFunctionCallParams),
};
