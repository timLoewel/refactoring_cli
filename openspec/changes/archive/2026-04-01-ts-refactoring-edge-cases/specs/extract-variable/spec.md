## Extract Variable — Edge Case Fixtures

### Context

Current: 1 fixture (`basic`). Implementation finds target expression by text-matching (`n.getText().trim() === targetText`), scopes replacements to the containing block.

### Key Concerns

**Text-matching ambiguity:** If `target = "a + b"` and there's also a node with text `(a + b)`, the match depends on trimming and getText granularity. Also: two different `a + b` sub-expressions in different places could both match.

**Operator precedence when inserting:** Extracted variable replaces `a * (b + c)` at the `(b + c)` site. The new variable is inserted without parens — `const sum = b + c; a * sum`. Semantically correct. But what about `a - b + c` — extracting `b + c` would need parens: `a - (b + c)` → need `a - sum` where sum = `b + c`. The current impl does simple text replacement, which is correct here.

**No-occurrence match:** Extracting an expression that appears zero times → clear precondition error (already handled).

### Fixtures to Add

#### Must Have

**1. repeated-expression**
Same expression appears multiple times — all occurrences in scope should be replaced.
```ts
export const params = { file: "fixture.ts", target: "items.length", name: "count" };

export function main(): string {
  const items = [1, 2, 3, 4];
  const half = Math.floor(items.length / 2);
  const last = items.length - 1;
  return `half=${half}, last=${last}`;
}
```
Expectation: Both `items.length` references replaced with `count`. `const count = items.length` inserted before.

**2. function-call-expression**
Extracting a function call expression.
```ts
export const params = { file: "fixture.ts", target: "Math.max(a, b)", name: "maximum" };

export function main(): string {
  const a = 10;
  const b = 20;
  const result = Math.max(a, b) * 2;
  return String(result);
}
```
Expectation: `Math.max(a, b)` extracted into `const maximum = Math.max(a, b)`.

**3. nested-scope**
Expression only in inner scope — variable declared in that inner scope, not outer.
```ts
export const params = { file: "fixture.ts", target: "x * 2", name: "doubled" };

export function main(): string {
  const x = 5;
  const result = (() => {
    const inner = x * 2;
    return inner + x * 2;
  })();
  return String(result);
}
```
Expectation: Both `x * 2` inside the arrow fn replaced with `doubled`. Variable declared inside the IIFE scope, not at the outer function level.

**4. string-literal**
Extracting a repeated string literal (magic string).
```ts
export const params = { file: "fixture.ts", target: '"application/json"', name: "JSON_MIME" };

export function main(): string {
  const a = "application/json";
  const b = "application/json";
  return a === b ? "match" : "no";
}
```

**5. object-literal**
Extracting an object literal expression.
```ts
export const params = { file: "fixture.ts", target: '{ x: 0, y: 0 }', name: "origin" };

export function main(): string {
  const a = { x: 0, y: 0 };
  const b = { x: 0, y: 0 };
  return JSON.stringify(a) === JSON.stringify(b) ? "equal" : "not";
}
```

#### Should Have

**6. conditional-expression**
Extracting a ternary expression.
```ts
export const params = { file: "fixture.ts", target: "n > 0 ? n : -n", name: "abs" };

export function main(): string {
  const n = -5;
  const result = n > 0 ? n : -n;
  return String(result);
}
```

**7. template-literal**
Extracting a template expression.
```ts
export const params = { file: "fixture.ts", target: '`Hello, ${name}!`', name: "greeting" };

export function main(): string {
  const name = "World";
  const msg = `Hello, ${name}!`;
  return msg;
}
```

#### Nice to Have

**8. partial-match-disambiguation**
Two similar but different expressions — should only replace exact match.
```ts
export const params = { file: "fixture.ts", target: "a + b", name: "sum" };

export function main(): string {
  const a = 1;
  const b = 2;
  const c = 3;
  const x = a + b;
  const y = a + b + c;  // "a + b" is a sub-expression here — should it be replaced?
  return String(x + y);
}
```
This tests whether the extraction replaces the sub-expression within `a + b + c`.
