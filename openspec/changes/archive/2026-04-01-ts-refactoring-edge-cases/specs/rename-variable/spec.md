## Rename Variable — Edge Case Fixtures

### Context

Current: 1 fixture (`basic` — simple `const count = 42` rename).
ts-morph's `nameNode.rename()` is scope-aware and should handle most cases. These fixtures primarily **document and lock in** existing behavior.

### Fixtures to Add

#### Must Have

**1. template-literal**
Variable referenced inside `${}` interpolation.
```ts
export const params = { file: "fixture.ts", target: "count", name: "total" };

export function main(): string {
  const count = 42;
  return `value is ${count}, doubled is ${count * 2}`;
}
```
Expectation: `count` renamed to `total` in both interpolation sites. ts-morph should handle this.

**2. shorthand-property**
Variable used as shorthand property in object literal.
```ts
export const params = { file: "fixture.ts", target: "name", name: "label" };

export function main(): string {
  const name = "Alice";
  const obj = { name };  // shorthand
  return obj.name;
}
```
Expectation: After rename, either `{ label }` (renaming both) or `{ name: label }` (preserving key, renaming value). ts-morph uses the rename symbol, so it should produce `{ label }` — the object property key changes too since it's the same symbol. Verify this.

**3. arrow-function-variable**
The variable IS an arrow function; rename should update all call sites.
```ts
export const params = { file: "fixture.ts", target: "calculate", name: "compute" };

export function main(): string {
  const calculate = (x: number): number => x * 2;
  const a = calculate(5);
  const b = calculate(10);
  return String(a + b);
}
```
Expectation: `calculate` renamed to `compute` at declaration and both call sites.

**4. shadowing**
Same variable name at different scope levels. Only the outer one should be renamed.
```ts
export const params = { file: "fixture.ts", target: "value", name: "outer" };

export function main(): string {
  const value = 10;
  const inner = (() => {
    const value = 20;   // shadows outer — must NOT be renamed
    return value;
  })();
  return String(value + inner);  // outer `value` must be renamed
}
```
Expectation: Outer `value` renamed to `outer`; inner `value` untouched. Note: current implementation uses `.find()` which returns the first VariableDeclaration — that's the outer one here. If the shadowed variable came first in source order, behavior would differ.

**5. property-vs-variable**
Variable name collides with an object property name. Only the variable should be renamed.
```ts
export const params = { file: "fixture.ts", target: "name", name: "label" };

export function main(): string {
  const name = "Tim";
  const obj = { name: "Alice" };  // object key "name" — NOT a reference to the variable
  obj.name = "Bob";               // property access — NOT a reference
  return name + obj.name;
}
```
Expectation: Only `const name` and `return name` are renamed. The `obj.name` property accesses are untouched.

**6. for-of-variable**
Loop binding variable.
```ts
export const params = { file: "fixture.ts", target: "item", name: "element" };

export function main(): string {
  const items = ["a", "b", "c"];
  const result: string[] = [];
  for (const item of items) {
    result.push(item.toUpperCase());
  }
  return result.join(",");
}
```
Expectation: `item` in loop binding and body renamed to `element`. Note: the current precondition looks for `VariableDeclaration` — a for-of binding is a VariableDeclaration, so this should be found.

**7. closure-capture**
Variable captured by a nested function.
```ts
export const params = { file: "fixture.ts", target: "factor", name: "multiplier" };

export function main(): string {
  const factor = 3;
  const multiply = (x: number): number => x * factor;
  const apply = (fn: (n: number) => number, n: number): number => fn(n);
  return String(apply(multiply, 7));
}
```
Expectation: `factor` renamed at declaration and inside the arrow function body.

**8. typeof-reference**
Variable referenced in a type position via `typeof`.
```ts
export const params = { file: "fixture.ts", target: "config", name: "settings" };

export function main(): string {
  const config = { debug: true, version: 1 };
  type Config = typeof config;
  const copy: Config = { ...config };
  return String(copy.debug);
}
```
Expectation: `config` renamed in value position and in `typeof config` type position.

#### Should Have

**9. function-parameter**
Rename a function parameter (not a VariableDeclaration — might need impl change).
```ts
export const params = { file: "fixture.ts", target: "input", name: "data" };

export function main(): string {
  const process = (input: string): string => input.toUpperCase();
  return process("hello");
}
```
Expectation: `input` renamed to `data` in parameter position and body. **Note:** Current implementation only searches `VariableDeclaration` nodes — function parameters are `ParameterDeclaration`, so this will likely fail the precondition. Implementation may need to broaden the search.

**10. computed-property-key**
Variable used as computed property key.
```ts
export const params = { file: "fixture.ts", target: "key", name: "prop" };

export function main(): string {
  const key = "name";
  const obj: Record<string, string> = { [key]: "value" };
  return obj[key];
}
```
Expectation: `key` renamed at declaration, in `[key]` computed property, and in `obj[key]` element access.

**11. default-parameter-value**
Variable used as default value for a function parameter.
```ts
export const params = { file: "fixture.ts", target: "fallback", name: "defaultVal" };

export function main(): string {
  const fallback = "unknown";
  const greet = (name: string = fallback): string => `Hello, ${name}`;
  return greet();
}
```
Expectation: `fallback` renamed at declaration and in default parameter expression.

**12. export-declaration**
Exported variable — rename should propagate through export.
```ts
export const params = { file: "fixture.ts", target: "version", name: "appVersion" };

export const version = "1.0";

export function main(): string {
  return `v${version}`;
}
```
Expectation: `version` renamed at declaration, in export, and in template literal reference.

#### Nice to Have

**13. let-mutation**
Mutable variable that is reassigned.
```ts
export const params = { file: "fixture.ts", target: "count", name: "total" };

export function main(): string {
  let count = 0;
  count += 10;
  count = count * 2;
  return String(count);
}
```
Expectation: All occurrences of `count` renamed to `total`, including assignment targets.

### Implementation Changes Expected

- **Most fixtures should pass as-is** — ts-morph's rename is robust.
- **Shorthand property (#2)** — verify behavior, may need documentation.
- **Shadowing (#4)** — works if outer declaration is first in source order. Current `.find()` picks first match, which is fragile.
- **Function parameter (#9)** — current precondition only searches `VariableDeclaration`. May need to also search `ParameterDeclaration` or use a broader ts-morph find-by-name.
- **For-of variable (#6)** — verify that for-of bindings are found as `VariableDeclaration` by ts-morph.
