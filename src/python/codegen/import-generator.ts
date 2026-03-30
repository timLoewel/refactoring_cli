/**
 * Import statement generator for Python.
 *
 * Given a symbol name and its definition location, produces the correct
 * Python import statement. Handles all import styles: absolute, relative,
 * aliased, and re-exports via __init__.py.
 */

export interface ImportSpec {
  /** The module path, e.g. "os.path", ".utils", "typing" */
  module: string;
  /** The symbol name imported from the module, if using `from X import Y` style */
  name?: string;
  /** Optional alias: `import X as alias` or `from X import Y as alias` */
  alias?: string;
  /** Whether this is a relative import (starts with .) */
  isRelative: boolean;
  /** Whether this import is type-only (belongs in `if TYPE_CHECKING:` block) */
  isTypeOnly: boolean;
}

const PYTHON_BUILTINS = new Set([
  "str",
  "int",
  "float",
  "bool",
  "list",
  "dict",
  "tuple",
  "set",
  "bytes",
  "None",
  "type",
  "object",
  "complex",
  "bytearray",
  "memoryview",
  "frozenset",
  "range",
  "slice",
  "super",
  "property",
  "classmethod",
  "staticmethod",
  "Exception",
  "BaseException",
  "TypeError",
  "ValueError",
  "KeyError",
  "IndexError",
  "AttributeError",
  "RuntimeError",
  "StopIteration",
  "NotImplementedError",
]);

/** PEP 585 builtin generics — no import needed in Python 3.9+ */
const PEP585_BUILTINS = new Set(["list", "dict", "tuple", "set", "frozenset", "type"]);

/** typing module symbols that have PEP 604/585 equivalents */
const TYPING_SYMBOLS = new Set([
  "Optional",
  "Union",
  "List",
  "Dict",
  "Tuple",
  "Set",
  "FrozenSet",
  "Type",
  "Callable",
  "Iterator",
  "Generator",
  "Coroutine",
  "AsyncIterator",
  "AsyncGenerator",
  "Sequence",
  "MutableSequence",
  "Mapping",
  "MutableMapping",
  "Any",
  "ClassVar",
  "Final",
  "Literal",
  "TypeVar",
  "TypeAlias",
  "Protocol",
  "runtime_checkable",
  "overload",
  "TYPE_CHECKING",
  "Self",
  "TypeGuard",
  "Never",
  "NoReturn",
  "Annotated",
  "ParamSpec",
  "Concatenate",
  "TypeVarTuple",
  "Unpack",
]);

/**
 * Check if a symbol name is a Python builtin that needs no import.
 */
export function isBuiltin(name: string): boolean {
  return PYTHON_BUILTINS.has(name);
}

/**
 * Check if a symbol name is a PEP 585 builtin generic (no typing import needed in 3.9+).
 */
export function isPep585Builtin(name: string): boolean {
  return PEP585_BUILTINS.has(name);
}

/**
 * Check if a symbol comes from the `typing` module.
 */
export function isTypingSymbol(name: string): boolean {
  return TYPING_SYMBOLS.has(name);
}

/**
 * Generate a Python import statement string from an ImportSpec.
 */
export function generateImportStatement(spec: ImportSpec): string {
  if (spec.name) {
    // from X import Y [as alias]
    const aliasPart = spec.alias ? ` as ${spec.alias}` : "";
    return `from ${spec.module} import ${spec.name}${aliasPart}`;
  }
  // import X [as alias]
  const aliasPart = spec.alias ? ` as ${spec.alias}` : "";
  return `import ${spec.module}${aliasPart}`;
}

/**
 * Create an ImportSpec for a symbol from the typing module.
 */
export function typingImport(name: string, isTypeOnly = false): ImportSpec {
  return {
    module: "typing",
    name,
    isRelative: false,
    isTypeOnly,
  };
}

/**
 * Create an ImportSpec for a `from module import name` style import.
 */
export function fromImport(
  module: string,
  name: string,
  options: { alias?: string; isTypeOnly?: boolean } = {},
): ImportSpec {
  return {
    module,
    name,
    alias: options.alias,
    isRelative: module.startsWith("."),
    isTypeOnly: options.isTypeOnly ?? false,
  };
}

/**
 * Create an ImportSpec for a plain `import module` style import.
 */
export function moduleImport(
  module: string,
  options: { alias?: string; isTypeOnly?: boolean } = {},
): ImportSpec {
  return {
    module,
    alias: options.alias,
    isRelative: module.startsWith("."),
    isTypeOnly: options.isTypeOnly ?? false,
  };
}

/**
 * Determine what import is needed for a type annotation reference.
 *
 * Returns null if no import is needed (builtin, PEP 585/604 syntax).
 * Returns an ImportSpec if an import is required.
 */
export function importForAnnotation(name: string, definitionModule?: string): ImportSpec | null {
  // Builtins need no import
  if (isBuiltin(name)) return null;

  // PEP 585 lowercase generics (list[int], dict[str, Any]) need no import
  // but their typing.* equivalents (List[int]) do
  if (isPep585Builtin(name)) return null;

  // typing module symbols
  if (isTypingSymbol(name)) {
    return typingImport(name);
  }

  // If we know the definition module, generate a from-import
  if (definitionModule) {
    return fromImport(definitionModule, name);
  }

  // Unknown — caller must resolve via pyright
  return null;
}
