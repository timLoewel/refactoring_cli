import type { Project, SourceFile, Node, ReferencedSymbol, Identifier } from "ts-morph";
import { SyntaxKind } from "ts-morph";

export type SymbolKind = "function" | "class" | "variable" | "interface" | "type" | "enum";

export interface SymbolInfo {
  name: string;
  kind: SymbolKind;
  filePath: string;
  line: number;
  exported: boolean;
}

export interface ReferenceInfo {
  filePath: string;
  line: number;
  text: string;
  isDefinition: boolean;
}

export interface SearchOptions {
  kind?: SymbolKind;
  exported?: boolean;
}

export interface UnusedOptions {
  kind?: SymbolKind;
  ignoreTests?: boolean;
}

interface DeclEntry {
  name: string;
  nameNode: Node;
  line: number;
  exported: boolean;
}

/** Extract named declarations from a source file, grouped by kind. */
function extractDeclarations(sf: SourceFile): Map<SymbolKind, DeclEntry[]> {
  const result = new Map<SymbolKind, DeclEntry[]>();

  result.set(
    "variable",
    sf.getVariableDeclarations().map((d) => ({
      name: d.getName(),
      nameNode: d.getNameNode(),
      line: d.getStartLineNumber(),
      exported: isExported(d),
    })),
  );

  result.set(
    "function",
    sf
      .getFunctions()
      .filter((d) => d.getName() !== undefined)
      .map((d) => ({
        name: d.getName() ?? "",
        nameNode: d.getNameNode() ?? d,
        line: d.getStartLineNumber(),
        exported: isExported(d),
      })),
  );

  result.set(
    "class",
    sf
      .getClasses()
      .filter((d) => d.getName() !== undefined)
      .map((d) => ({
        name: d.getName() ?? "",
        nameNode: d.getNameNode() ?? d,
        line: d.getStartLineNumber(),
        exported: isExported(d),
      })),
  );

  result.set(
    "interface",
    sf.getInterfaces().map((d) => ({
      name: d.getName(),
      nameNode: d.getNameNode(),
      line: d.getStartLineNumber(),
      exported: isExported(d),
    })),
  );

  result.set(
    "type",
    sf.getTypeAliases().map((d) => ({
      name: d.getName(),
      nameNode: d.getNameNode(),
      line: d.getStartLineNumber(),
      exported: isExported(d),
    })),
  );

  result.set(
    "enum",
    sf.getEnums().map((d) => ({
      name: d.getName(),
      nameNode: d.getNameNode(),
      line: d.getStartLineNumber(),
      exported: isExported(d),
    })),
  );

  return result;
}

const ALL_KINDS: SymbolKind[] = ["variable", "function", "class", "interface", "type", "enum"];

interface DeclarationEntry {
  name: string;
  kind: SymbolKind;
  filePath: string;
  line: number;
  exported: boolean;
  nameNode: Node;
}

function* forEachDeclaration(
  sourceFiles: SourceFile[],
  kinds: SymbolKind[] = ALL_KINDS,
): Generator<DeclarationEntry> {
  for (const sf of sourceFiles) {
    const filePath = sf.getFilePath();
    const decls = extractDeclarations(sf);
    for (const kind of kinds) {
      for (const entry of decls.get(kind) ?? []) {
        yield {
          name: entry.name,
          kind,
          filePath,
          line: entry.line,
          exported: entry.exported,
          nameNode: entry.nameNode,
        };
      }
    }
  }
}

export function searchSymbols(
  project: Project,
  pattern: string,
  options: SearchOptions = {},
): SymbolInfo[] {
  const kinds = options.kind ? [options.kind] : ALL_KINDS;
  const results: SymbolInfo[] = [];

  for (const decl of forEachDeclaration(project.getSourceFiles(), kinds)) {
    if (!matchesPattern(decl.name, pattern)) continue;
    if (options.exported && !decl.exported) continue;
    results.push({
      name: decl.name,
      kind: decl.kind,
      filePath: decl.filePath,
      line: decl.line,
      exported: decl.exported,
    });
  }

  return results;
}

export function findReferences(
  project: Project,
  symbolName: string,
  options: { transitive?: boolean; kind?: SymbolKind } = {},
): ReferenceInfo[] {
  const declarations = findDeclarationNodes(project, symbolName, options.kind);
  const allRefs: ReferenceInfo[] = [];
  const seen = new Set<string>();

  for (const decl of declarations) {
    const refs = collectReferences(decl, seen);
    allRefs.push(...refs);
  }

  if (options.transitive) {
    collectTransitiveRefs(project, symbolName, allRefs, seen);
  }

  return allRefs;
}

export function findUnused(project: Project, options: UnusedOptions = {}): SymbolInfo[] {
  const sourceFiles = options.ignoreTests
    ? project.getSourceFiles().filter((sf) => !isTestFile(sf.getFilePath()))
    : project.getSourceFiles();
  const kinds = options.kind ? [options.kind] : ALL_KINDS;

  const unused: SymbolInfo[] = [];
  for (const decl of forEachDeclaration(sourceFiles, kinds)) {
    if (!hasNonDefinitionRefs(project, decl.name, decl.kind, options.ignoreTests)) {
      unused.push({
        name: decl.name,
        kind: decl.kind,
        filePath: decl.filePath,
        line: decl.line,
        exported: decl.exported,
      });
    }
  }
  return unused;
}

function hasNonDefinitionRefs(
  project: Project,
  name: string,
  kind: SymbolKind,
  ignoreTests?: boolean,
): boolean {
  const refs = findReferences(project, name, { kind });
  const nonDefRefs = ignoreTests
    ? refs.filter((r) => !r.isDefinition && !isTestFile(r.filePath))
    : refs.filter((r) => !r.isDefinition);
  return nonDefRefs.length > 0;
}

function isTestFile(filePath: string): boolean {
  return /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(filePath);
}

function matchesPattern(name: string, pattern: string): boolean {
  return name === pattern || name.toLowerCase().includes(pattern.toLowerCase());
}

function isExported(node: Node): boolean {
  if ("isExported" in node && typeof node.isExported === "function") {
    return (node as { isExported: () => boolean }).isExported();
  }
  const parent = node.getParent();
  if (parent && "isExported" in parent && typeof parent.isExported === "function") {
    return (parent as { isExported: () => boolean }).isExported();
  }
  return false;
}

function findDeclarationNodes(project: Project, name: string, kind?: SymbolKind): Node[] {
  const kinds = kind ? [kind] : ALL_KINDS;
  const nodes: Node[] = [];
  for (const decl of forEachDeclaration(project.getSourceFiles(), kinds)) {
    if (decl.name === name) {
      nodes.push(decl.nameNode);
    }
  }
  return nodes;
}

function collectReferences(node: Node, seen: Set<string>): ReferenceInfo[] {
  const refs: ReferenceInfo[] = [];

  let referencedSymbols: ReferencedSymbol[];
  try {
    referencedSymbols = (node as Identifier).findReferences();
  } catch {
    return refs;
  }

  for (const refSymbol of referencedSymbols) {
    for (const ref of refSymbol.getReferences()) {
      const sf = ref.getSourceFile();
      const filePath = sf.getFilePath();
      const line = ref.getTextSpan().getStart();
      const lineNumber = sf.getLineAndColumnAtPos(line).line;
      const key = `${filePath}:${String(lineNumber)}`;

      if (!seen.has(key)) {
        seen.add(key);
        refs.push({
          filePath,
          line: lineNumber,
          text: ref.getNode().getText(),
          isDefinition: ref.isDefinition() ?? false,
        });
      }
    }
  }
  return refs;
}

function extractCallerNames(
  project: Project,
  refs: ReferenceInfo[],
  excludeName: string,
): Set<string> {
  const callerNames = new Set<string>();
  for (const ref of refs) {
    if (!ref.isDefinition) {
      const callerName = extractCallerName(project, ref.filePath, ref.line);
      if (callerName && callerName !== excludeName) {
        callerNames.add(callerName);
      }
    }
  }
  return callerNames;
}

function collectTransitiveRefs(
  project: Project,
  symbolName: string,
  allRefs: ReferenceInfo[],
  seen: Set<string>,
): void {
  for (const callerName of extractCallerNames(project, allRefs, symbolName)) {
    const transitiveRefs = findReferences(project, callerName, { transitive: false });
    for (const ref of transitiveRefs) {
      const key = `${ref.filePath}:${String(ref.line)}`;
      if (!seen.has(key)) {
        seen.add(key);
        allRefs.push(ref);
      }
    }
  }
}

function extractCallerName(project: Project, filePath: string, line: number): string | null {
  const sf = project.getSourceFile(filePath);
  if (!sf) return null;

  const pos = sf.compilerNode.getPositionOfLineAndCharacter(line - 1, 0);
  const node = sf.getDescendantAtPos(pos);
  if (!node) return null;

  let current: Node | undefined = node;
  while (current) {
    if (
      current.getKind() === SyntaxKind.FunctionDeclaration ||
      current.getKind() === SyntaxKind.MethodDeclaration
    ) {
      const name = (current as { getName?: () => string | undefined }).getName?.();
      if (name) return name;
    }
    current = current.getParent();
  }
  return null;
}
