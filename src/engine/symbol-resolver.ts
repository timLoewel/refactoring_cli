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

export function searchSymbols(
  project: Project,
  pattern: string,
  options: SearchOptions = {},
): SymbolInfo[] {
  const results: SymbolInfo[] = [];
  const kinds = options.kind ? [options.kind] : ALL_KINDS;

  for (const sf of project.getSourceFiles()) {
    const filePath = sf.getFilePath();
    const decls = extractDeclarations(sf);

    for (const kind of kinds) {
      const entries = decls.get(kind) ?? [];
      for (const entry of entries) {
        if (!matchesPattern(entry.name, pattern)) continue;
        if (options.exported && !entry.exported) continue;
        results.push(makeSymbolInfo(entry.name, kind, filePath, entry.line, entry.exported));
      }
    }
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
  const unused: SymbolInfo[] = [];
  const sourceFiles = options.ignoreTests
    ? project.getSourceFiles().filter((sf) => !isTestFile(sf.getFilePath()))
    : project.getSourceFiles();

  for (const sf of sourceFiles) {
    const symbols = getAllSymbolsInFile(sf);
    for (const sym of symbols) {
      if (options.kind && sym.kind !== options.kind) continue;

      const refs = findReferences(project, sym.name, { kind: sym.kind });
      const nonDefinitionRefs = options.ignoreTests
        ? refs.filter((r) => !r.isDefinition && !isTestFile(r.filePath))
        : refs.filter((r) => !r.isDefinition);

      if (nonDefinitionRefs.length === 0) {
        unused.push(sym);
      }
    }
  }

  return unused;
}

function isTestFile(filePath: string): boolean {
  return /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(filePath);
}

function matchesPattern(name: string, pattern: string): boolean {
  return name === pattern || name.toLowerCase().includes(pattern.toLowerCase());
}

function makeSymbolInfo(
  name: string,
  kind: SymbolKind,
  filePath: string,
  line: number,
  exported: boolean,
): SymbolInfo {
  return { name, kind, filePath, line, exported };
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
  const nodes: Node[] = [];
  const kinds = kind ? [kind] : ALL_KINDS;

  for (const sf of project.getSourceFiles()) {
    const decls = extractDeclarations(sf);
    for (const k of kinds) {
      const entries = decls.get(k) ?? [];
      for (const entry of entries) {
        if (entry.name === name) {
          nodes.push(entry.nameNode);
        }
      }
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

function collectTransitiveRefs(
  project: Project,
  symbolName: string,
  allRefs: ReferenceInfo[],
  seen: Set<string>,
): void {
  const callerNames = new Set<string>();
  for (const ref of allRefs) {
    if (!ref.isDefinition) {
      const callerName = extractCallerName(project, ref.filePath, ref.line);
      if (callerName && callerName !== symbolName) {
        callerNames.add(callerName);
      }
    }
  }
  for (const callerName of callerNames) {
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

function getAllSymbolsInFile(sf: SourceFile): SymbolInfo[] {
  const symbols: SymbolInfo[] = [];
  const filePath = sf.getFilePath();
  const decls = extractDeclarations(sf);

  for (const kind of ALL_KINDS) {
    const entries = decls.get(kind) ?? [];
    for (const entry of entries) {
      symbols.push(makeSymbolInfo(entry.name, kind, filePath, entry.line, entry.exported));
    }
  }

  return symbols;
}
