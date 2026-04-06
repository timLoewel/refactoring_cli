## Python AST Integration

### Requirements

- MUST spawn `pyright-langserver --stdio` and manage its lifecycle (initialize, shutdown, process cleanup)
- MUST keep the LSP server running across multiple refactoring operations within a session
- MUST support LSP requests: `textDocument/references`, `textDocument/definition`, `textDocument/hover`, `textDocument/rename`, `textDocument/prepareRename`
- MUST parse Python files using `tree-sitter-python` and provide positional CST nodes
- MUST apply text edits to Python source using tree-sitter node positions without corrupting surrounding text
- MUST handle pyright initialization delay (project analysis) gracefully — block until ready, don't timeout prematurely
- MUST detect pyright process crash and auto-restart on next refactoring request
- MUST perform graceful shutdown (LSP `shutdown` + `exit` requests) on CLI exit
- MUST fail with a clear error if pyright is not installed or Python project has no configuration
- SHOULD auto-detect Python project root (look for `pyproject.toml`, `setup.py`, `pyrightconfig.json`)
