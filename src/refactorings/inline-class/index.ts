import { SyntaxKind } from "ts-morph";
import type { Project, ClassDeclaration } from "ts-morph";
import type {
  RefactoringDefinition,
  ParamSchema,
  PreconditionResult,
  RefactoringResult,
} from "../../engine/refactoring.types.js";

interface InlineClassParams {
  file: string;
  target: string;
  into: string;
}

const params: ParamSchema = {
  definitions: [
    { name: "file", type: "string", description: "Path to the TypeScript file", required: true },
    { name: "target", type: "string", description: "Name of the class to inline", required: true },
    {
      name: "into",
      type: "string",
      description: "Name of the class to receive the inlined members",
      required: true,
    },
  ],
  validate(raw: unknown): InlineClassParams {
    const r = raw as Record<string, unknown>;
    if (typeof r["file"] !== "string" || r["file"].trim() === "") {
      throw new Error("param 'file' must be a non-empty string");
    }
    if (typeof r["target"] !== "string" || r["target"].trim() === "") {
      throw new Error("param 'target' must be a non-empty string");
    }
    if (typeof r["into"] !== "string" || r["into"].trim() === "") {
      throw new Error("param 'into' must be a non-empty string");
    }
    return {
      file: r["file"] as string,
      target: r["target"] as string,
      into: r["into"] as string,
    };
  },
};

function preconditions(project: Project, p: InlineClassParams): PreconditionResult {
  const errors: string[] = [];

  const sf = project.getSourceFile(p.file);
  if (!sf) {
    errors.push(`File not found in project: ${p.file}`);
    return { ok: false, errors };
  }

  const classes = sf.getDescendantsOfKind(SyntaxKind.ClassDeclaration);
  const targetClass = classes.find((c) => c.getName() === p.target);
  if (!targetClass) {
    errors.push(`Class '${p.target}' not found in file: ${p.file}`);
  }

  const intoClass = classes.find((c) => c.getName() === p.into);
  if (!intoClass) {
    errors.push(`Class '${p.into}' not found in file: ${p.file}`);
  }

  if (p.target === p.into) {
    errors.push("'target' and 'into' must be different classes");
  }

  return { ok: errors.length === 0, errors };
}

function copyMembersIntoClass(memberTexts: string[], intoClass: ClassDeclaration): void {
  for (const memberText of memberTexts) {
    intoClass.addMember(memberText);
  }
}

function apply(project: Project, p: InlineClassParams): RefactoringResult {
  const sf = project.getSourceFile(p.file);
  if (!sf) {
    return { success: false, filesChanged: [], description: `File not found: ${p.file}` };
  }

  const classes = sf.getDescendantsOfKind(SyntaxKind.ClassDeclaration);
  const targetClass = classes.find((c) => c.getName() === p.target);
  const intoClass = classes.find((c) => c.getName() === p.into);

  if (!targetClass || !intoClass) {
    return {
      success: false,
      filesChanged: [],
      description: `One or both classes not found`,
    };
  }

  const members = targetClass.getMembers();
  const memberTexts = members.map((m) => m.getText());

  copyMembersIntoClass(memberTexts, intoClass);

  targetClass.remove();

  return {
    success: true,
    filesChanged: [p.file],
    description: `Inlined class '${p.target}' into '${p.into}' (${memberTexts.length} member(s) moved)`,
  };
}

export const inlineClass: RefactoringDefinition = {
  name: "Inline Class",
  kebabName: "inline-class",
  description: "Moves all members of one class into another class and removes the emptied class.",
  tier: 3,
  params,
  preconditions: (project: Project, raw: unknown): PreconditionResult =>
    preconditions(project, params.validate(raw) as InlineClassParams),
  apply: (project: Project, raw: unknown): RefactoringResult =>
    apply(project, params.validate(raw) as InlineClassParams),
};
