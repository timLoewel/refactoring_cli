import Parser from "tree-sitter";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

let _language: Parser.Language | undefined;

function getLanguage(): Parser.Language {
  if (!_language) {
    _language = require("tree-sitter-python") as Parser.Language;
  }
  return _language;
}

let _sharedParser: Parser | undefined;

export function createPythonParser(): Parser {
  const parser = new Parser();
  parser.setLanguage(getLanguage());
  return parser;
}

export function parsePython(source: string): Parser.Tree {
  if (!_sharedParser) {
    _sharedParser = createPythonParser();
  }
  return _sharedParser.parse(source);
}
