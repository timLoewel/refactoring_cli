## Codebase navigation with roam

This project uses `roam` for codebase comprehension. Always prefer roam over Glob/Grep/Read exploration.

Before modifying any code:
1. First time in the repo: `roam understand` then `roam tour`
2. Find a symbol: `roam search <pattern>`
3. Before changing a symbol: `roam preflight <name>` (blast radius + tests + fitness)
4. Need files to read: `roam context <name>` (files + line ranges, prioritized)
5. Debugging a failure: `roam diagnose <name>` (root cause ranking)
6. After making changes: `roam diff` (blast radius of uncommitted changes)

Additional commands: `roam health` (0-100 score), `roam impact <name>` (what breaks),
`roam pr-risk` (PR risk score), `roam file <path>` (file skeleton).

Run `roam --help` for all commands. Use `roam --json <cmd>` for structured output.

# Project Architecture

## Project Overview

- **Files:** 17
- **Symbols:** 0
- **Edges:** 0
- **Languages:** markdown (16), yaml (1)

## Directory Structure

| Directory | Files | Primary Language |
|-----------|-------|------------------|
| `.opencode/` | 8 | markdown |
| `.claude/` | 8 | markdown |
| `openspec/` | 1 | yaml |

## Entry Points

No conventional entry points detected.

## Key Abstractions

No graph metrics available.

## Architecture

No graph data available.

## Testing

- **Test files:** 1
- **Source files:** 16
- **Test-to-source ratio:** 0.06

## Coding Conventions

Follow these conventions when writing code in this project:
Make sure to use meaningful names. Not one letter words or heavy abbreviations. 

## Complexity Hotspots


## Domain Keywords


## Core Modules

No dependency data available.
