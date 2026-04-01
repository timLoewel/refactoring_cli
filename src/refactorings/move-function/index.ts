import type { FunctionDeclaration, ImportDeclaration, Project, SourceFile } from "ts-morph";
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

    const fn = sf.getFunction(target);
    if (!fn) {
      errors.push(`Function '${target}' not found in file: ${file}`);
    }

    const destSf = project.getSourceFile(destination);
    if (!destSf) {
      errors.push(`Destination file not found in project: ${destination}`);
    } else {
      const existing = destSf.getFunction(target);
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

    const fn = sf.getFunction(target);
    if (!fn) {
      return { success: false, filesChanged: [], description: `Function '${target}' not found` };
    }

    const destSf = project.getSourceFile(destination);
    if (!destSf) {
      return {
        success: false,
        filesChanged: [],
        description: `Destination file not found: ${destination}`,
      };
    }

    // Collect overloads + implementation (in source order)
    const overloads = fn.getOverloads();
    const allDecls: FunctionDeclaration[] = [...overloads, fn];

    // Build the full function text (with JSDoc) from overloads + implementation
    const functionText = allDecls
      .map((d) => d.getFullText().trimStart())
      .join("")
      .trim();

    // Find imports used by the function and carry them to destination
    const neededImports = findNeededImports(allDecls, sf);
    for (const importDecl of neededImports) {
      const resolvedFile = importDecl.getModuleSpecifierSourceFile();
      const newModuleSpec = resolvedFile
        ? destSf.getRelativePathAsModuleSpecifierTo(resolvedFile)
        : importDecl.getModuleSpecifierValue();

      const alreadyPresent = destSf
        .getImportDeclarations()
        .some((d) => d.getModuleSpecifierValue() === newModuleSpec);
      if (alreadyPresent) continue;

      destSf.addImportDeclaration(buildImportStructure(importDecl, newModuleSpec));
    }

    // Find module-level variable dependencies (not from imports) and export them from source
    const localDepNames = findLocalDependencies(allDecls, sf);
    for (const depName of localDepNames) {
      const vs = sf
        .getVariableStatements()
        .find((s) => s.getDeclarations().some((d) => d.getName() === depName));
      if (vs && !vs.isExported()) {
        vs.setIsExported(true);
      }
      // Add import in dest pointing to source
      const relPath = destSf.getRelativePathAsModuleSpecifierTo(sf);
      const alreadyPresent = destSf
        .getImportDeclarations()
        .some(
          (d) =>
            d.getModuleSpecifierValue() === relPath &&
            d.getNamedImports().some((n) => n.getName() === depName),
        );
      if (!alreadyPresent) {
        destSf.addImportDeclaration({ namedImports: [depName], moduleSpecifier: relPath });
      }
    }

    // Update all consumer imports BEFORE removing from source
    // (getModuleSpecifierSourceFile() returns undefined after removal if source has no exports)
    const filesChanged = new Set<string>([file, destination]);
    for (const otherSf of project.getSourceFiles()) {
      if (otherSf === sf || otherSf === destSf) continue;
      updateConsumerImport(otherSf, sf, destSf, target, filesChanged);
    }

    // Add the function(s) to destination
    destSf.addStatements(`\n${functionText}`);

    // Remove the implementation — ts-morph automatically removes associated overloads
    fn.remove();

    return {
      success: true,
      filesChanged: [...filesChanged],
      description: `Moved function '${target}' from '${file}' to '${destination}'`,
    };
  },
});

function findNeededImports(fns: FunctionDeclaration[], sf: SourceFile): ImportDeclaration[] {
  const fnText = fns.map((f) => f.getText()).join(" ");
  const needed: ImportDeclaration[] = [];

  for (const importDecl of sf.getImportDeclarations()) {
    const names: string[] = importDecl.getNamedImports().map((n) => n.getName());
    const defaultImport = importDecl.getDefaultImport()?.getText();
    const namespaceImport = importDecl.getNamespaceImport()?.getText();
    if (defaultImport) names.push(defaultImport);
    if (namespaceImport) names.push(namespaceImport);

    const used = names.some((name) => new RegExp(`\\b${name}\\b`).test(fnText));
    if (used) needed.push(importDecl);
  }

  return needed;
}

function findLocalDependencies(fns: FunctionDeclaration[], sf: SourceFile): string[] {
  const fnText = fns.map((f) => f.getText()).join(" ");
  const importedNames = new Set<string>(
    sf.getImportDeclarations().flatMap((d) => {
      const names: string[] = d.getNamedImports().map((n) => n.getName());
      const def = d.getDefaultImport()?.getText();
      const ns = d.getNamespaceImport()?.getText();
      if (def) names.push(def);
      if (ns) names.push(ns);
      return names;
    }),
  );

  const movingNames = new Set<string>(fns.map((f) => f.getName()).filter(Boolean) as string[]);

  const deps: string[] = [];
  for (const vs of sf.getVariableStatements()) {
    for (const decl of vs.getDeclarations()) {
      const name = decl.getName();
      if (!importedNames.has(name) && !movingNames.has(name)) {
        if (new RegExp(`\\b${name}\\b`).test(fnText)) {
          deps.push(name);
        }
      }
    }
  }
  return deps;
}

function buildImportStructure(
  importDecl: ImportDeclaration,
  newModuleSpec: string,
): Parameters<SourceFile["addImportDeclaration"]>[0] {
  const namedImports = importDecl.getNamedImports().map((n) => {
    const alias = n.getAliasNode()?.getText();
    return alias ? { name: n.getName(), alias } : n.getName();
  });
  const namespaceImport = importDecl.getNamespaceImport()?.getText();
  const defaultImport = importDecl.getDefaultImport()?.getText();

  return {
    isTypeOnly: importDecl.isTypeOnly(),
    moduleSpecifier: newModuleSpec,
    ...(namespaceImport
      ? { namespaceImport }
      : defaultImport
        ? { defaultImport, namedImports: namedImports.length ? namedImports : undefined }
        : { namedImports }),
  };
}

function updateConsumerImport(
  otherSf: SourceFile,
  sourceSf: SourceFile,
  destSf: SourceFile,
  target: string,
  filesChanged: Set<string>,
): void {
  for (const importDecl of otherSf.getImportDeclarations()) {
    const resolvedSf = importDecl.getModuleSpecifierSourceFile();
    if (resolvedSf !== sourceSf) continue;

    const hasTarget = importDecl.getNamedImports().some((n) => n.getName() === target);
    if (!hasTarget) continue;

    const newPath = otherSf.getRelativePathAsModuleSpecifierTo(destSf);
    importDecl.setModuleSpecifier(newPath);
    filesChanged.add(otherSf.getFilePath());
  }
}
