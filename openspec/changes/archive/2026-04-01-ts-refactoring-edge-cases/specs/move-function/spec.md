## Move Function — Edge Case Fixtures

### Context

Current: 1 fixture (`basic` — single-file, function with no imports or external references).
The implementation copies function text to destination and removes from source. No import handling whatsoever. This is the most impactful gap because silent import breakage is the most common real-world failure mode.

All fixtures below are **multi-file** (directory with `entry.ts` + supporting files). The existing fixture infra supports this format.

### Fixtures to Add

#### Must Have

**1. carries-imports**
Function body uses a symbol that's imported at the top of the source file. That import must follow the function to the destination.
```
fixtures/carries-imports/
├── entry.ts
├── source.ts
├── dest.ts
└── utils.ts
```

`utils.ts`:
```ts
export function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}
```

`source.ts`:
```ts
import { formatCurrency } from "./utils";

export function formatPrice(price: number): string {
  return formatCurrency(price);
}

export function otherStuff(): string {
  return "other";
}
```

`entry.ts`:
```ts
export const params = { file: "source.ts", target: "formatPrice", destination: "dest.ts" };

import { formatPrice } from "./source";

export function main(): string {
  return formatPrice(9.99);
}
```

`dest.ts`: (empty or minimal)
```ts
export {};
```

Expectation: After move, `dest.ts` contains `formatPrice` AND `import { formatCurrency } from "./utils"`. The `formatCurrency` import in `source.ts` stays (needed by other code) or is removed (if only `formatPrice` used it). `entry.ts` import path updates to `./dest`.

**2. consumer-updates**
Other files import the moved function. Their import paths must be updated.
```
fixtures/consumer-updates/
├── entry.ts
├── source.ts
├── dest.ts
└── consumer.ts
```

`source.ts`:
```ts
export function helper(): string {
  return "help";
}
```

`consumer.ts`:
```ts
import { helper } from "./source";

export function useHelper(): string {
  return helper();
}
```

`entry.ts`:
```ts
export const params = { file: "source.ts", target: "helper", destination: "dest.ts" };

import { useHelper } from "./consumer";

export function main(): string {
  return useHelper();
}
```

`dest.ts`:
```ts
export {};
```

Expectation: After move, `consumer.ts` import changes from `"./source"` to `"./dest"`. The function is exported from `dest.ts`.

**3. preserves-export**
Moving an exported function — the export modifier must be preserved in destination (or added).
```
fixtures/preserves-export/
├── entry.ts
├── source.ts
└── dest.ts
```

`source.ts`:
```ts
export function compute(x: number): number {
  return x * 2;
}
```

`entry.ts`:
```ts
export const params = { file: "source.ts", target: "compute", destination: "dest.ts" };

import { compute } from "./source";

export function main(): string {
  return String(compute(21));
}
```

`dest.ts`:
```ts
export {};
```

Expectation: `compute` is `export function` in destination. `entry.ts` import path updates.

**4. with-type-imports**
Function signature uses a type that's imported via `import type`. That type import must follow.
```
fixtures/with-type-imports/
├── entry.ts
├── source.ts
├── dest.ts
└── types.ts
```

`types.ts`:
```ts
export interface Config {
  name: string;
  value: number;
}
```

`source.ts`:
```ts
import type { Config } from "./types";

export function describe(config: Config): string {
  return `${config.name}: ${config.value}`;
}
```

`entry.ts`:
```ts
export const params = { file: "source.ts", target: "describe", destination: "dest.ts" };

import { describe } from "./source";

export function main(): string {
  return describe({ name: "test", value: 42 });
}
```

`dest.ts`:
```ts
export {};
```

Expectation: `dest.ts` gets `import type { Config } from "./types"` AND the function. Source file's type import can be removed if nothing else uses it.

**5. references-local-constant**
Function references a constant/variable defined in the same source file.
```
fixtures/references-local/
├── entry.ts
├── source.ts
└── dest.ts
```

`source.ts`:
```ts
const TAX_RATE = 0.08;

export function calculateTax(amount: number): number {
  return amount * TAX_RATE;
}

export function otherCalc(x: number): number {
  return x * TAX_RATE;
}
```

`entry.ts`:
```ts
export const params = { file: "source.ts", target: "calculateTax", destination: "dest.ts" };

import { calculateTax } from "./source";

export function main(): string {
  return calculateTax(100).toFixed(2);
}
```

`dest.ts`:
```ts
export {};
```

Expectation: `TAX_RATE` is used by both `calculateTax` (being moved) and `otherCalc` (staying). Options: (a) export `TAX_RATE` from source and import in dest, (b) duplicate constant, (c) refuse. Best: export from source, import in dest.

**6. no-dependencies**
Function has zero external references. Simplest multi-file case — validates the basic multi-file fixture infra works.
```
fixtures/no-deps/
├── entry.ts
├── source.ts
└── dest.ts
```

`source.ts`:
```ts
export function greet(): string {
  return "hello";
}
```

`entry.ts`:
```ts
export const params = { file: "source.ts", target: "greet", destination: "dest.ts" };

import { greet } from "./source";

export function main(): string {
  return greet();
}
```

`dest.ts`:
```ts
export {};
```

Expectation: Function moves cleanly. `entry.ts` import updates. No dependency resolution needed.

#### Should Have

**7. with-jsdoc**
Function has a JSDoc comment. The comment must move with the function.
```
fixtures/with-jsdoc/
├── entry.ts
├── source.ts
└── dest.ts
```

`source.ts`:
```ts
/**
 * Adds two numbers.
 * @param a - First number
 * @param b - Second number
 */
export function add(a: number, b: number): number {
  return a + b;
}
```

`entry.ts`:
```ts
export const params = { file: "source.ts", target: "add", destination: "dest.ts" };

import { add } from "./source";

export function main(): string {
  return String(add(3, 4));
}
```

Expectation: JSDoc preserved in destination. ts-morph's `getText()` may or may not include leading comments — need to verify and possibly use `getFullText()`.

**8. namespace-import**
Function uses a namespace import.
```
fixtures/namespace-import/
├── entry.ts
├── source.ts
├── dest.ts
└── utils.ts
```

`utils.ts`:
```ts
export function format(x: number): string { return x.toFixed(2); }
export function parse(s: string): number { return parseFloat(s); }
```

`source.ts`:
```ts
import * as utils from "./utils";

export function process(input: string): string {
  const num = utils.parse(input);
  return utils.format(num * 2);
}
```

`entry.ts`:
```ts
export const params = { file: "source.ts", target: "process", destination: "dest.ts" };

import { process } from "./source";

export function main(): string {
  return process("3.14");
}
```

Expectation: `dest.ts` gets `import * as utils from "./utils"` AND the function.

**9. overloaded-function**
Function with TypeScript overload signatures. All signatures must move together.
```
fixtures/overloaded/
├── entry.ts
├── source.ts
└── dest.ts
```

`source.ts`:
```ts
export function convert(x: number): string;
export function convert(x: string): number;
export function convert(x: number | string): string | number {
  return typeof x === "number" ? String(x) : parseInt(x);
}
```

`entry.ts`:
```ts
export const params = { file: "source.ts", target: "convert", destination: "dest.ts" };

import { convert } from "./source";

export function main(): string {
  const a = convert(42);
  const b = convert("7");
  return `${a},${b}`;
}
```

Expectation: All three declarations (two overloads + implementation) move together.

**10. arrow-function-in-const (precondition rejection or support)**
Function is defined as an arrow function in a const.
```
fixtures/arrow-function/
├── entry.ts
├── source.ts
└── dest.ts
```

`source.ts`:
```ts
export const multiply = (a: number, b: number): number => a * b;
```

`entry.ts`:
```ts
export const params = { file: "source.ts", target: "multiply", destination: "dest.ts" };

import { multiply } from "./source";

export function main(): string {
  return String(multiply(6, 7));
}
```

Expectation: Either support moving const arrow functions (broadening the search from FunctionDeclaration to include VariableDeclaration with arrow), or refuse with a clear error.

#### Nice to Have

**11. re-export-barrel**
Function is re-exported through a barrel/index file.
```
fixtures/barrel-reexport/
├── entry.ts
├── source.ts
├── dest.ts
└── index.ts  (barrel)
```

Expectation: Barrel file re-export path updates.

**12. generic-function**
Function with type parameters.
```ts
export function identity<T>(x: T): T { return x; }
```
Expectation: Generics preserved (should work via getText).

### Implementation Changes Required

1. **Import analysis:**
   - Walk function body AST, collect all identifiers
   - Cross-reference with source file's imports to find which imports the function depends on
   - Copy needed imports to destination (avoiding duplicates with existing imports)

2. **Consumer import rewriting:**
   - Scan all project source files for imports from the source file that reference the moved function
   - Rewrite import specifiers: change path from source to destination
   - Handle the case where the import has other specifiers (only move the one for the moved function)

3. **Export preservation:**
   - If function was exported, ensure it's exported in destination
   - If function was default export, handle the semantics change

4. **Local reference handling:**
   - If function references module-level constants/functions in source:
     - If the referenced symbol is only used by the moved function → move it too
     - If shared → export from source, import in destination

5. **Overload support:**
   - When finding the function, also find all overload signatures with the same name
   - Move all declarations together

6. **JSDoc preservation:**
   - Use `fn.getFullText()` instead of `fn.getText()` to capture leading trivia (comments/JSDoc)
   - Or explicitly get the leading comment ranges
