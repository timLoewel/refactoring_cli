import { SyntaxKind } from "ts-morph";
import type { Project } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { defineRefactoring, param } from "../../core/refactoring-builder.js";

export const moveFunction = defineRefactoring({
  name: "Move Function",
  kebabName: "move-function",
  tier: 3,
  description: "Moves a function declaration from one file to another file in the project.",
  params: [
    param.file(),
    param.identifier("target", "Name of the function to move"),
    param.string("destination", "Destination file path (must already exist in the project)"),
  ],
  preconditions(project: Project, params: Record<string, unknown>): PreconditionResult {
    const errors: string[] = [];
    const file = params["file"] as string;
    const target = params["target"] as string;
    const destination = params["destination"] as string;

    const sf = project.getSourceFile(file);
    if (!sf) {
      errors.push(`File not found in project: ${file}`);
      return { ok: false, errors };
    }

    const fn = sf
      .getDescendantsOfKind(SyntaxKind.FunctionDeclaration)
      .find((f) => f.getName() === target);
    if (!fn) {
      errors.push(`Function '${target}' not found in file: ${file}`);
    }

    const destSf = project.getSourceFile(destination);
    if (!destSf) {
      errors.push(`Destination file not found in project: ${destination}`);
    } else {
      const existing = destSf
        .getDescendantsOfKind(SyntaxKind.FunctionDeclaration)
        .find((f) => f.getName() === target);
      if (existing) {
        errors.push(`Function '${target}' already exists in destination file`);
      }
    }

    if (file === destination) {
      errors.push("'file' and 'destination' must be different files");
    }

    return { ok: errors.length === 0, errors };
  },
  apply(project: Project, params: Record<string, unknown>): RefactoringResult {
    const file = params["file"] as string;
    const target = params["target"] as string;
    const destination = params["destination"] as string;

    const sf = project.getSourceFile(file);
    if (!sf) {
      return { success: false, filesChanged: [], description: `File not found: ${file}` };
    }

    const fn = sf
      .getDescendantsOfKind(SyntaxKind.FunctionDeclaration)
      .find((f) => f.getName() === target);
    if (!fn) {
      return {
        success: false,
        filesChanged: [],
        description: `Function '${target}' not found`,
      };
    }

    const destSf = project.getSourceFile(destination);
    if (!destSf) {
      return {
        success: false,
        filesChanged: [],
        description: `Destination file not found: ${destination}`,
      };
    }

    const functionText = fn.getText();
    fn.remove();
    destSf.addStatements(`\n${functionText}`);

    return {
      success: true,
      filesChanged: [file, destination],
      description: `Moved function '${target}' from '${file}' to '${destination}'`,
    };
  },
});
