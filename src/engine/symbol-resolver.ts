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

export function searchSymbols(
  project: Project,
  pattern: string,
  options: SearchOptions = {},
): SymbolInfo[] {
  const results: SymbolInfo[] = [];

  for (const sf of project.getSourceFiles()) {
    collectSymbols(sf, pattern, options, results);
  }

  return results;
}

export function findReferences(
  project: Project,
  symbolName: string,
  options: { transitive?: boolean; kind?: SymbolKind } = {},
): ReferenceInfo[] {
  const declarations = findDeclarations(project, symbolName, options.kind);
  const allRefs: ReferenceInfo[] = [];
  const seen = new Set<string>();

  for (const decl of declarations) {
    const refs = collectReferences(decl, seen);
    allRefs.push(...refs);
  }

  if (options.transitive) {
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

function collectSymbols(
  sf: SourceFile,
  pattern: string,
  options: SearchOptions,
  results: SymbolInfo[],
): void {
  const filePath = sf.getFilePath();

  for (const decl of sf.getVariableDeclarations()) {
    if (matchesPattern(decl.getName(), pattern)) {
      const info = makeSymbolInfo(
        decl.getName(),
        "variable",
        filePath,
        decl.getStartLineNumber(),
        isExported(decl),
      );
      if (matchesOptions(info, options)) results.push(info);
    }
  }

  for (const decl of sf.getFunctions()) {
    const name = decl.getName();
    if (name && matchesPattern(name, pattern)) {
      const info = makeSymbolInfo(
        name,
        "function",
        filePath,
        decl.getStartLineNumber(),
        isExported(decl),
      );
      if (matchesOptions(info, options)) results.push(info);
    }
  }

  for (const decl of sf.getClasses()) {
    const name = decl.getName();
    if (name && matchesPattern(name, pattern)) {
      const info = makeSymbolInfo(
        name,
        "class",
        filePath,
        decl.getStartLineNumber(),
        isExported(decl),
      );
      if (matchesOptions(info, options)) results.push(info);
    }
  }

  for (const decl of sf.getInterfaces()) {
    if (matchesPattern(decl.getName(), pattern)) {
      const info = makeSymbolInfo(
        decl.getName(),
        "interface",
        filePath,
        decl.getStartLineNumber(),
        isExported(decl),
      );
      if (matchesOptions(info, options)) results.push(info);
    }
  }

  for (const decl of sf.getTypeAliases()) {
    if (matchesPattern(decl.getName(), pattern)) {
      const info = makeSymbolInfo(
        decl.getName(),
        "type",
        filePath,
        decl.getStartLineNumber(),
        isExported(decl),
      );
      if (matchesOptions(info, options)) results.push(info);
    }
  }

  for (const decl of sf.getEnums()) {
    if (matchesPattern(decl.getName(), pattern)) {
      const info = makeSymbolInfo(
        decl.getName(),
        "enum",
        filePath,
        decl.getStartLineNumber(),
        isExported(decl),
      );
      if (matchesOptions(info, options)) results.push(info);
    }
  }
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

function matchesOptions(info: SymbolInfo, options: SearchOptions): boolean {
  if (options.kind && info.kind !== options.kind) return false;
  if (options.exported && !info.exported) return false;
  return true;
}

function isExported(node: Node): boolean {
  // Check if the node or its parent has export keyword
  if ("isExported" in node && typeof node.isExported === "function") {
    return (node as { isExported: () => boolean }).isExported();
  }
  // For variable declarations, check the parent statement
  const parent = node.getParent();
  if (parent && "isExported" in parent && typeof parent.isExported === "function") {
    return (parent as { isExported: () => boolean }).isExported();
  }
  return false;
}

function findDeclarations(project: Project, name: string, kind?: SymbolKind): Node[] {
  const nodes: Node[] = [];
  for (const sf of project.getSourceFiles()) {
    if (kind === "function" || !kind) {
      for (const fn of sf.getFunctions()) {
        if (fn.getName() === name) nodes.push(fn.getNameNode() ?? fn);
      }
    }
    if (kind === "class" || !kind) {
      for (const cls of sf.getClasses()) {
        if (cls.getName() === name) nodes.push(cls.getNameNode() ?? cls);
      }
    }
    if (kind === "variable" || !kind) {
      for (const v of sf.getVariableDeclarations()) {
        if (v.getName() === name) nodes.push(v.getNameNode());
      }
    }
    if (kind === "interface" || !kind) {
      for (const i of sf.getInterfaces()) {
        if (i.getName() === name) nodes.push(i.getNameNode());
      }
    }
    if (kind === "type" || !kind) {
      for (const t of sf.getTypeAliases()) {
        if (t.getName() === name) nodes.push(t.getNameNode());
      }
    }
    if (kind === "enum" || !kind) {
      for (const e of sf.getEnums()) {
        if (e.getName() === name) nodes.push(e.getNameNode());
      }
    }
  }
  return nodes;
}

function collectReferences(node: Node, seen: Set<string>): ReferenceInfo[] {
  const refs: ReferenceInfo[] = [];

  // Cast to Identifier which has findReferences
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

function extractCallerName(project: Project, filePath: string, line: number): string | null {
  const sf = project.getSourceFile(filePath);
  if (!sf) return null;

  // Walk up from the line to find the containing function/method
  const pos = sf.compilerNode.getPositionOfLineAndCharacter(line - 1, 0);
  const node = sf.getDescendantAtPos(pos);
  if (!node) return null;

  let current: Node | undefined = node;
  while (current) {
    if (current.getKind() === SyntaxKind.FunctionDeclaration) {
      const name = (current as { getName?: () => string | undefined }).getName?.();
      if (name) return name;
    }
    if (current.getKind() === SyntaxKind.MethodDeclaration) {
      const name = (current as { getName?: () => string }).getName?.();
      if (name) return name;
    }
    current = current.getParent();
  }
  return null;
}

function getAllSymbolsInFile(sf: SourceFile): SymbolInfo[] {
  const symbols: SymbolInfo[] = [];
  const filePath = sf.getFilePath();

  for (const decl of sf.getVariableDeclarations()) {
    symbols.push(
      makeSymbolInfo(
        decl.getName(),
        "variable",
        filePath,
        decl.getStartLineNumber(),
        isExported(decl),
      ),
    );
  }
  for (const decl of sf.getFunctions()) {
    const name = decl.getName();
    if (name) {
      symbols.push(
        makeSymbolInfo(name, "function", filePath, decl.getStartLineNumber(), isExported(decl)),
      );
    }
  }
  for (const decl of sf.getClasses()) {
    const name = decl.getName();
    if (name) {
      symbols.push(
        makeSymbolInfo(name, "class", filePath, decl.getStartLineNumber(), isExported(decl)),
      );
    }
  }
  for (const decl of sf.getInterfaces()) {
    symbols.push(
      makeSymbolInfo(
        decl.getName(),
        "interface",
        filePath,
        decl.getStartLineNumber(),
        isExported(decl),
      ),
    );
  }
  for (const decl of sf.getTypeAliases()) {
    symbols.push(
      makeSymbolInfo(decl.getName(), "type", filePath, decl.getStartLineNumber(), isExported(decl)),
    );
  }
  for (const decl of sf.getEnums()) {
    symbols.push(
      makeSymbolInfo(decl.getName(), "enum", filePath, decl.getStartLineNumber(), isExported(decl)),
    );
  }
  return symbols;
}
