import Parser from "tree-sitter";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Python = require("tree-sitter-python") as Parser.Language;

export function createPythonParser(): Parser {
  const parser = new Parser();
  parser.setLanguage(Python);
  return parser;
}

export function parsePython(source: string): Parser.Tree {
  const parser = createPythonParser();
  return parser.parse(source);
}
