import Parser from "web-tree-sitter";
import { createRequire } from "node:module";
import path from "node:path";

let initialized = false;

async function ensureInit(): Promise<void> {
  if (!initialized) {
    await Parser.init();
    initialized = true;
  }
}

function getPythonWasmPath(): string {
  const require = createRequire(import.meta.url);
  const wasmsDir = path.dirname(require.resolve("tree-sitter-wasms/package.json"));
  return path.join(wasmsDir, "out", "tree-sitter-python.wasm");
}

let cachedLanguage: Parser.Language | null = null;

async function getPythonLanguage(): Promise<Parser.Language> {
  await ensureInit();
  if (!cachedLanguage) {
    cachedLanguage = await Parser.Language.load(getPythonWasmPath());
  }
  return cachedLanguage;
}

export async function createPythonParser(): Promise<Parser> {
  const language = await getPythonLanguage();
  const parser = new Parser();
  parser.setLanguage(language);
  return parser;
}

export async function parsePython(source: string): Promise<Parser.Tree> {
  const parser = await createPythonParser();
  const tree = parser.parse(source);
  parser.delete();
  return tree;
}
