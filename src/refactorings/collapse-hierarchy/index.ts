import { SyntaxKind } from "ts-morph";
import type { ClassDeclaration, Project, SourceFile } from "ts-morph";
import type { PreconditionResult, RefactoringResult } from "../../core/refactoring.types.js";
import { defineRefactoring, enumerate, param } from "../../core/refactoring-builder.js";
import { cleanupUnused } from "../../core/cleanup-unused.js";

function findClassByName(sf: SourceFile, name: string): ClassDeclaration | undefined {
  return sf.getDescendantsOfKind(SyntaxKind.ClassDeclaration).find((c) => c.getName() === name);
}

function preconditions(project: Project, params: Record<string, unknown>): PreconditionResult {
  const file = params["file"] as string;
  const target = params["target"] as string;
  const errors: string[] = [];

  const sf = project.getSourceFile(file);
  if (!sf) {
    return { ok: false, errors: [`File not found in project: ${file}`] };
  }

  const subclass = findClassByName(sf, target);
  if (!subclass) {
    return { ok: false, errors: [`Class '${target}' not found in file`] };
  }

  const extendsClause = subclass.getExtends();
  if (!extendsClause) {
    return { ok: false, errors: [`Class '${target}' does not extend any class`] };
  }

  const parentName = extendsClause.getExpression().getText();
  const parentClass = findClassByName(sf, parentName);
  if (!parentClass) {
    errors.push(`Parent class '${parentName}' not found in file — cannot collapse across files`);
  }

  // Refuse if the subclass is exported — removing it would break importers
  if (subclass.isExported()) {
    const subName = subclass.getName() ?? target;
    // Check if any other file imports this class
    for (const otherSf of project.getSourceFiles()) {
      if (otherSf === sf) continue;
      for (const imp of otherSf.getImportDeclarations()) {
        const namedImports = imp.getNamedImports();
        if (namedImports.some((n) => n.getName() === subName)) {
          errors.push(
            `Class '${subName}' is imported by ${otherSf.getBaseName()} — collapsing would break importers`,
          );
          return { ok: false, errors };
        }
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

function apply(project: Project, params: Record<string, unknown>): RefactoringResult {
  const file = params["file"] as string;
  const target = params["target"] as string;

  const sf = project.getSourceFile(file);
  if (!sf) {
    return { success: false, filesChanged: [], description: `File not found: ${file}` };
  }

  const subclass = findClassByName(sf, target);
  if (!subclass) {
    return { success: false, filesChanged: [], description: `Class '${target}' not found` };
  }

  const extendsClause = subclass.getExtends();
  if (!extendsClause) {
    return { success: false, filesChanged: [], description: `Class '${target}' has no superclass` };
  }

  const parentName = extendsClause.getExpression().getText();
  const parentClass = findClassByName(sf, parentName);
  if (!parentClass) {
    return {
      success: false,
      filesChanged: [],
      description: `Parent class '${parentName}' not found in file`,
    };
  }

  // Move members from subclass to parent
  const subMembers = subclass.getMembers();
  for (const member of subMembers) {
    parentClass.addMember(member.getText());
  }

  // Rename all references to the subclass to use the parent name
  const nameNode = subclass.getNameNode();
  if (nameNode) {
    const refs = nameNode.findReferencesAsNodes();
    for (const ref of refs) {
      if (ref !== nameNode) {
        ref.replaceWithText(parentName);
      }
    }
  }

  subclass.remove();

  cleanupUnused(sf);

  return {
    success: true,
    filesChanged: [file],
    description: `Collapsed subclass '${target}' into parent class '${parentName}'`,
  };
}

export const collapseHierarchy = defineRefactoring({
  name: "Collapse Hierarchy",
  kebabName: "collapse-hierarchy",
  description:
    "Merges a subclass that adds nothing meaningful back into its parent class and removes the subclass.",
  tier: 4,
  params: [
    param.file(),
    param.string("target", "Name of the subclass to collapse into its parent"),
  ],
  preconditions,
  apply,
  enumerate: enumerate.classes,
});
