/**
 * Annotation preservation for Python.
 *
 * Extracts type references from source text, determines which need imports
 * when code is moved to a new file.
 */

import type { ImportSpec } from "./import-generator.js";
import { importForAnnotation, isBuiltin, isPep585Builtin } from "./import-generator.js";

/**
 * Extract top-level type names referenced in a Python annotation string.
 *
 * Examples:
 *   "Optional[str]"                → ["Optional", "str"]
 *   "dict[str, Any]"               → ["dict", "str", "Any"]
 *   "Union[str, int]"              → ["Union", "str", "int"]
 *   "Optional[List[datetime]]"     → ["Optional", "List", "datetime"]
 *   '"MyClass"'                    → ["MyClass"]  (string annotation / forward ref)
 *   "list[int]"                    → ["list", "int"]
 *   "str | None"                   → ["str"]  (None is builtin)
 *   "Callable[[int, str], bool]"   → ["Callable", "int", "str", "bool"]
 */
export function extractTypeNames(annotation: string): string[] {
  // Strip string quotes (forward references)
  let text = annotation.trim();
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    text = text.slice(1, -1);
  }

  const names = new Set<string>();
  extractTypeNamesInner(text, names);
  return [...names];
}

function extractTypeNamesInner(text: string, names: Set<string>): void {
  // Remove whitespace around operators
  const cleaned = text.trim();
  if (cleaned === "") return;

  // Handle union syntax: X | Y
  if (cleaned.includes("|") && !cleaned.includes("[")) {
    for (const part of cleaned.split("|")) {
      extractTypeNamesInner(part.trim(), names);
    }
    return;
  }

  // Handle generic syntax: Name[args]
  const bracketIdx = cleaned.indexOf("[");
  if (bracketIdx !== -1) {
    const outer = cleaned.slice(0, bracketIdx).trim();
    if (outer && isIdentifier(outer)) {
      names.add(outer);
    }
    // Extract inner arguments
    const inner = cleaned.slice(bracketIdx + 1, findMatchingBracket(cleaned, bracketIdx));
    for (const arg of splitTopLevelArgs(inner)) {
      extractTypeNamesInner(arg.trim(), names);
    }
    return;
  }

  // Handle union syntax with | that wasn't caught above (nested)
  if (cleaned.includes("|")) {
    for (const part of cleaned.split("|")) {
      extractTypeNamesInner(part.trim(), names);
    }
    return;
  }

  // Plain identifier
  if (isIdentifier(cleaned)) {
    names.add(cleaned);
  }
}

function isIdentifier(s: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(s);
}

function findMatchingBracket(text: string, openIdx: number): number {
  let depth = 1;
  for (let i = openIdx + 1; i < text.length; i++) {
    if (text[i] === "[") depth++;
    if (text[i] === "]") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return text.length;
}

function splitTopLevelArgs(text: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let current = "";

  for (const ch of text) {
    if (ch === "[") {
      depth++;
      current += ch;
    } else if (ch === "]") {
      depth--;
      current += ch;
    } else if (ch === "," && depth === 0) {
      args.push(current);
      current = "";
    } else {
      current += ch;
    }
  }

  if (current.trim()) {
    args.push(current);
  }

  return args;
}

/**
 * Given a list of type names used in annotations, determine which need imports.
 *
 * @param typeNames - type names extracted from annotations
 * @param definitionModules - optional map of type name → module where it's defined
 * @returns list of ImportSpecs for types that need importing
 */
export function resolveAnnotationImports(
  typeNames: string[],
  definitionModules?: Map<string, string>,
): ImportSpec[] {
  const imports: ImportSpec[] = [];
  const seen = new Set<string>();

  for (const name of typeNames) {
    if (seen.has(name)) continue;
    seen.add(name);

    // Skip builtins and PEP 585 lowercase generics
    if (isBuiltin(name) || isPep585Builtin(name)) continue;

    // Skip None
    if (name === "None") continue;

    const defModule = definitionModules?.get(name);
    const spec = importForAnnotation(name, defModule);
    if (spec) {
      imports.push(spec);
    }
  }

  return imports;
}

/**
 * Extract all annotation strings from a function signature or class body.
 * Returns the raw annotation text for each parameter and return type.
 */
export function extractAnnotationsFromSignature(signature: string): string[] {
  const annotations: string[] = [];

  // Match parameter annotations: `name: Type`
  const paramPattern = /:\s*([^,=)]+?)(?:\s*[,=)])/g;
  let match;
  while ((match = paramPattern.exec(signature)) !== null) {
    const ann = match[1]?.trim();
    if (ann) annotations.push(ann);
  }

  // Match return annotation: `-> Type:`
  const returnPattern = /->\s*(.+?)\s*:/;
  const returnMatch = returnPattern.exec(signature);
  if (returnMatch) {
    const ann = returnMatch[1]?.trim();
    if (ann) annotations.push(ann);
  }

  return annotations;
}
