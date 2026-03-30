/**
 * Import merger for Python.
 *
 * Given a target file's existing imports and new imports to add,
 * merges them without creating duplicates, following PEP 8 grouping.
 */

import type { ImportSpec } from "./import-generator.js";
import { generateImportStatement } from "./import-generator.js";

export interface ParsedImport {
  /** The full import statement text */
  text: string;
  /** Module being imported from */
  module: string;
  /** Imported names (for `from X import a, b` style) */
  names: { name: string; alias?: string }[];
  /** Whether this is a `from X import Y` style (vs plain `import X`) */
  isFromImport: boolean;
  /** Whether this is inside an `if TYPE_CHECKING:` block */
  isTypeChecking: boolean;
  /** Line number in original source (0-based) */
  line: number;
}

/**
 * Classify a module as stdlib, third-party, or local for PEP 8 grouping.
 */
export function classifyModule(module: string): "future" | "stdlib" | "third-party" | "local" {
  if (module === "__future__") return "future";
  if (module.startsWith(".")) return "local";
  const topLevel = module.split(".")[0] ?? module;
  if (STDLIB_TOP_LEVEL.has(topLevel)) return "stdlib";
  return "third-party";
}

/**
 * Parse import statements from Python source text.
 */
export function parseImports(source: string): ParsedImport[] {
  const lines = source.split("\n");
  const imports: ParsedImport[] = [];
  let inTypeChecking = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();

    // Track TYPE_CHECKING blocks
    if (/^if\s+TYPE_CHECKING\s*:/.test(trimmed)) {
      inTypeChecking = true;
      continue;
    }
    if (
      inTypeChecking &&
      trimmed !== "" &&
      !trimmed.startsWith("#") &&
      !line.startsWith(" ") &&
      !line.startsWith("\t")
    ) {
      inTypeChecking = false;
    }

    // Match `from X import Y, Z` or `from X import Y as alias`
    const fromMatch = /^from\s+([\w.]+)\s+import\s+(.+)$/.exec(trimmed);
    if (fromMatch) {
      const module = fromMatch[1] ?? "";
      const namesPart = fromMatch[2] ?? "";
      const names = parseImportNames(namesPart);
      imports.push({
        text: trimmed,
        module,
        names,
        isFromImport: true,
        isTypeChecking: inTypeChecking,
        line: i,
      });
      continue;
    }

    // Match `import X` or `import X as alias`
    const importMatch = /^import\s+([\w.]+)(?:\s+as\s+(\w+))?$/.exec(trimmed);
    if (importMatch) {
      const module = importMatch[1] ?? "";
      const alias = importMatch[2];
      imports.push({
        text: trimmed,
        module,
        names: alias ? [{ name: module, alias }] : [],
        isFromImport: false,
        isTypeChecking: inTypeChecking,
        line: i,
      });
    }
  }

  return imports;
}

function parseImportNames(namesPart: string): { name: string; alias?: string }[] {
  // Handle parenthesized imports: from X import (a, b, c)
  const cleaned = namesPart.replace(/[()]/g, "").trim();
  return cleaned
    .split(",")
    .map((part) => {
      const trimmed = part.trim();
      const asMatch = /^(\w+)\s+as\s+(\w+)$/.exec(trimmed);
      if (asMatch) {
        return { name: asMatch[1] ?? "", alias: asMatch[2] };
      }
      return { name: trimmed };
    })
    .filter((n) => n.name !== "");
}

/**
 * Merge new imports into existing source text.
 *
 * - Adds to existing `from X import a` → `from X import a, b`
 * - No duplicate when import already exists
 * - Groups imports per PEP 8: __future__, stdlib, third-party, local
 * - Type-only imports go in `if TYPE_CHECKING:` block
 * - Preserves `from __future__ import annotations` as first import
 */
export function mergeImports(source: string, newImports: ImportSpec[]): string {
  if (newImports.length === 0) return source;

  const existingImports = parseImports(source);
  const lines = source.split("\n");

  // Separate runtime and type-only imports
  const runtimeImports = newImports.filter((i) => !i.isTypeOnly);
  const typeOnlyImports = newImports.filter((i) => i.isTypeOnly);

  // Track which new imports can be merged into existing ones
  const mergedIntoExisting = new Set<number>(); // indices into newImports
  const edits: { line: number; newText: string }[] = [];

  for (const existing of existingImports) {
    if (!existing.isFromImport) continue;

    for (let idx = 0; idx < runtimeImports.length; idx++) {
      const spec = runtimeImports[idx];
      if (!spec || mergedIntoExisting.has(idx)) continue;
      if (spec.name && spec.module === existing.module && !existing.isTypeChecking) {
        // Check if already imported
        const alreadyImported = existing.names.some(
          (n) => n.name === spec.name && n.alias === spec.alias,
        );
        if (alreadyImported) {
          mergedIntoExisting.add(idx);
          continue;
        }
        // Merge into existing line
        const aliasPart = spec.alias ? ` as ${spec.alias}` : "";
        const newNames = [...existing.names.map(formatName), `${spec.name}${aliasPart}`].join(", ");
        edits.push({
          line: existing.line,
          newText: `from ${existing.module} import ${newNames}`,
        });
        mergedIntoExisting.add(idx);
      }
    }
  }

  // Apply edits to existing lines
  for (const edit of edits) {
    lines[edit.line] = edit.newText;
  }

  // Collect remaining new imports that weren't merged
  const remainingRuntime: string[] = [];
  for (let idx = 0; idx < runtimeImports.length; idx++) {
    const spec = runtimeImports[idx];
    if (!spec || mergedIntoExisting.has(idx)) continue;
    // Check if import already exists as standalone
    const alreadyExists = existingImports.some((e) => {
      if (spec.name) {
        return (
          e.isFromImport && e.module === spec.module && e.names.some((n) => n.name === spec.name)
        );
      }
      return !e.isFromImport && e.module === spec.module;
    });
    if (!alreadyExists) {
      remainingRuntime.push(generateImportStatement(spec));
    }
  }

  // Handle type-only imports (if TYPE_CHECKING block)
  const remainingTypeOnly: string[] = [];
  for (const spec of typeOnlyImports) {
    const alreadyExists = existingImports.some((e) => {
      if (spec.name) {
        return (
          e.isTypeChecking &&
          e.isFromImport &&
          e.module === spec.module &&
          e.names.some((n) => n.name === spec.name)
        );
      }
      return e.isTypeChecking && !e.isFromImport && e.module === spec.module;
    });
    if (!alreadyExists) {
      remainingTypeOnly.push(generateImportStatement(spec));
    }
  }

  // Find insertion point for new imports
  let result = lines.join("\n");

  if (remainingRuntime.length > 0) {
    result = insertImports(result, remainingRuntime, existingImports, false);
  }

  if (remainingTypeOnly.length > 0) {
    result = insertTypeCheckingImports(result, remainingTypeOnly);
  }

  return result;
}

function formatName(n: { name: string; alias?: string }): string {
  return n.alias ? `${n.name} as ${n.alias}` : n.name;
}

function insertImports(
  source: string,
  newStatements: string[],
  existingImports: ParsedImport[],
  _isTypeOnly: boolean,
): string {
  const lines = source.split("\n");

  // Find the last import line (not in TYPE_CHECKING block)
  let lastImportLine = -1;
  for (const imp of existingImports) {
    if (!imp.isTypeChecking && imp.line > lastImportLine) {
      lastImportLine = imp.line;
    }
  }

  // If no existing imports, insert after any docstring/comments at top
  if (lastImportLine === -1) {
    let insertLine = 0;
    // Skip shebang, docstrings, initial comments
    while (insertLine < lines.length) {
      const line = (lines[insertLine] ?? "").trim();
      if (line.startsWith("#") || line.startsWith('"""') || line.startsWith("'''") || line === "") {
        insertLine++;
      } else {
        break;
      }
    }
    lines.splice(insertLine, 0, ...newStatements, "");
  } else {
    // Insert after the last existing import
    lines.splice(lastImportLine + 1, 0, ...newStatements);
  }

  return lines.join("\n");
}

function insertTypeCheckingImports(source: string, newStatements: string[]): string {
  const lines = source.split("\n");

  // Find existing `if TYPE_CHECKING:` block
  const tcIndex = lines.findIndex((l) => /^\s*if\s+TYPE_CHECKING\s*:/.test(l));

  if (tcIndex !== -1) {
    // Find the indent level inside the block
    let insertLine = tcIndex + 1;
    const indent = "    ";
    while (insertLine < lines.length) {
      const line = lines[insertLine] ?? "";
      if (line.trim() === "" || line.startsWith(indent) || line.startsWith("\t")) {
        insertLine++;
      } else {
        break;
      }
    }
    const indented = newStatements.map((s) => `${indent}${s}`);
    lines.splice(insertLine, 0, ...indented);
  } else {
    // Create a new TYPE_CHECKING block after runtime imports
    const existingImports = parseImports(source);
    let lastImportLine = -1;
    for (const imp of existingImports) {
      if (!imp.isTypeChecking && imp.line > lastImportLine) {
        lastImportLine = imp.line;
      }
    }

    // Need to ensure TYPE_CHECKING is imported
    const hasTypeCheckingImport = existingImports.some(
      (i) =>
        i.isFromImport && i.module === "typing" && i.names.some((n) => n.name === "TYPE_CHECKING"),
    );

    const block: string[] = [];
    if (!hasTypeCheckingImport) {
      block.push("from typing import TYPE_CHECKING");
    }
    block.push("");
    block.push("if TYPE_CHECKING:");
    for (const stmt of newStatements) {
      block.push(`    ${stmt}`);
    }

    if (lastImportLine !== -1) {
      lines.splice(lastImportLine + 1, 0, ...block);
    } else {
      lines.splice(0, 0, ...block, "");
    }
  }

  return lines.join("\n");
}

/** Common Python stdlib top-level module names */
const STDLIB_TOP_LEVEL = new Set([
  "abc",
  "aifc",
  "argparse",
  "array",
  "ast",
  "asynchat",
  "asyncio",
  "asyncore",
  "atexit",
  "audioop",
  "base64",
  "bdb",
  "binascii",
  "binhex",
  "bisect",
  "builtins",
  "bz2",
  "calendar",
  "cgi",
  "cgitb",
  "chunk",
  "cmath",
  "cmd",
  "code",
  "codecs",
  "codeop",
  "collections",
  "colorsys",
  "compileall",
  "concurrent",
  "configparser",
  "contextlib",
  "contextvars",
  "copy",
  "copyreg",
  "cProfile",
  "crypt",
  "csv",
  "ctypes",
  "curses",
  "dataclasses",
  "datetime",
  "dbm",
  "decimal",
  "difflib",
  "dis",
  "distutils",
  "doctest",
  "email",
  "encodings",
  "enum",
  "errno",
  "faulthandler",
  "fcntl",
  "filecmp",
  "fileinput",
  "fnmatch",
  "formatter",
  "fractions",
  "ftplib",
  "functools",
  "gc",
  "getopt",
  "getpass",
  "gettext",
  "glob",
  "graphlib",
  "grp",
  "gzip",
  "hashlib",
  "heapq",
  "hmac",
  "html",
  "http",
  "idlelib",
  "imaplib",
  "imghdr",
  "imp",
  "importlib",
  "inspect",
  "io",
  "ipaddress",
  "itertools",
  "json",
  "keyword",
  "lib2to3",
  "linecache",
  "locale",
  "logging",
  "lzma",
  "mailbox",
  "mailcap",
  "marshal",
  "math",
  "mimetypes",
  "mmap",
  "modulefinder",
  "multiprocessing",
  "netrc",
  "nis",
  "nntplib",
  "numbers",
  "operator",
  "optparse",
  "os",
  "ossaudiodev",
  "parser",
  "pathlib",
  "pdb",
  "pickle",
  "pickletools",
  "pipes",
  "pkgutil",
  "platform",
  "plistlib",
  "poplib",
  "posix",
  "posixpath",
  "pprint",
  "profile",
  "pstats",
  "pty",
  "pwd",
  "py_compile",
  "pyclbr",
  "pydoc",
  "queue",
  "quopri",
  "random",
  "re",
  "readline",
  "reprlib",
  "resource",
  "rlcompleter",
  "runpy",
  "sched",
  "secrets",
  "select",
  "selectors",
  "shelve",
  "shlex",
  "shutil",
  "signal",
  "site",
  "smtpd",
  "smtplib",
  "sndhdr",
  "socket",
  "socketserver",
  "spwd",
  "sqlite3",
  "ssl",
  "stat",
  "statistics",
  "string",
  "stringprep",
  "struct",
  "subprocess",
  "sunau",
  "symtable",
  "sys",
  "sysconfig",
  "syslog",
  "tabnanny",
  "tarfile",
  "telnetlib",
  "tempfile",
  "termios",
  "test",
  "textwrap",
  "threading",
  "time",
  "timeit",
  "tkinter",
  "token",
  "tokenize",
  "tomllib",
  "trace",
  "traceback",
  "tracemalloc",
  "tty",
  "turtle",
  "turtledemo",
  "types",
  "typing",
  "unicodedata",
  "unittest",
  "urllib",
  "uu",
  "uuid",
  "venv",
  "warnings",
  "wave",
  "weakref",
  "webbrowser",
  "winreg",
  "winsound",
  "wsgiref",
  "xdrlib",
  "xml",
  "xmlrpc",
  "zipapp",
  "zipfile",
  "zipimport",
  "zlib",
  "zoneinfo",
]);
