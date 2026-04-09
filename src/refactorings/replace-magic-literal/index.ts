import { Node, SyntaxKind } from "ts-morph";
import type { Project } from "ts-morph";
import type {
  EnumerateCandidate,
  PreconditionResult,
  RefactoringResult,
  SourceFileContext,
} from "../../core/refactoring.types.js";
import { defineRefactoring, param, resolve } from "../../core/refactoring-builder.js";

export const replaceMagicLiteral = defineRefactoring<SourceFileContext>({
  name: "Replace Magic Literal",
  kebabName: "replace-magic-literal",
  tier: 1,
  description:
    "Replaces all occurrences of a magic literal value with a named constant declaration.",
  params: [
    param.file(),
    param.string("target", "The literal value to replace (as a string, e.g. '42' or '\"hello\"')"),
    param.identifier("name", "Name for the new named constant"),
  ],
  resolve: (project, params) => resolve.sourceFile(project, params as { file: string }),
  preconditions(ctx: SourceFileContext, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const sf = ctx.sourceFile;
    const target = params["target"] as string;
    const name = params["name"] as string;

    const matches = sf.getDescendants().filter((n) => {
      const kind = n.getKind();
      return (
        (kind === SyntaxKind.NumericLiteral || kind === SyntaxKind.StringLiteral) &&
        n.getText() === target
      );
    });

    if (matches.length === 0) {
      errors.push(`Literal '${target}' not found in file: ${params["file"] as string}`);
    }

    if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name)) {
      errors.push(`'${name}' is not a valid identifier`);
    }

    // Ensure no existing declaration with that name
    const existing = sf
      .getDescendantsOfKind(SyntaxKind.VariableDeclaration)
      .find((d) => d.getName() === name);
    if (existing) {
      errors.push(`A variable named '${name}' already exists in the file`);
    }

    return { ok: errors.length === 0, errors };
  },
  apply(ctx: SourceFileContext, params: Record<string, unknown>): RefactoringResult {
    const sf = ctx.sourceFile;
    const file = params["file"] as string;
    const target = params["target"] as string;
    const name = params["name"] as string;

    const literalNodes = sf.getDescendants().filter((n) => {
      const kind = n.getKind();
      return (
        (kind === SyntaxKind.NumericLiteral || kind === SyntaxKind.StringLiteral) &&
        n.getText() === target
      );
    });

    if (literalNodes.length === 0) {
      return {
        success: false,
        filesChanged: [],
        description: `Literal '${target}' not found in file`,
      };
    }

    // Replace all occurrences in reverse order, then insert the constant declaration.
    const sorted = [...literalNodes].sort((a, b) => b.getStart() - a.getStart());
    for (const node of sorted) {
      const ancestor = node.getParent();
      if (ancestor && Node.isVariableDeclaration(ancestor) && ancestor.getName() === name) {
        continue;
      }
      node.replaceWithText(name);
    }

    // Insert `const NAME = VALUE;` at the top of the source file
    sf.insertStatements(0, `const ${name} = ${target};\n`);

    return {
      success: true,
      filesChanged: [file],
      description: `Replaced magic literal '${target}' with named constant '${name}'`,
    };
  },
  enumerate(project: Project): EnumerateCandidate[] {
    const candidates: EnumerateCandidate[] = [];
    for (const sf of project.getSourceFiles()) {
      const file = sf.getFilePath();
      // Count occurrences per literal text — only include those appearing 2+ times
      const counts = new Map<string, number>();
      for (const lit of [
        ...sf.getDescendantsOfKind(SyntaxKind.NumericLiteral),
        ...sf.getDescendantsOfKind(SyntaxKind.StringLiteral),
      ]) {
        const text = lit.getText();
        counts.set(text, (counts.get(text) ?? 0) + 1);
      }
      for (const [text, count] of counts) {
        if (count >= 2) candidates.push({ file, target: text });
      }
    }
    return candidates;
  },
});
