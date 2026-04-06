## Inline Variable — Edge Case Fixtures

### Context

Current: 1 fixture (`basic`). Implementation finds all identifier references and replaces with initializer text. Key concern: if the initializer has side effects, inlining at multiple sites changes evaluation semantics.

### Key Concerns

**Side-effect initializer:** `const x = computeExpensive()`. If `x` is used 3 times and we inline, `computeExpensive()` is now called 3 times. This is a semantic change! Should require a precondition: initializer must be side-effect free (or used exactly once).

**Operator precedence:** `const x = a + b; return x * 2` → inlining produces `return (a + b) * 2` — needs parens. Current impl: raw `getText()` which gives `a + b`, then replace → `a + b * 2` (wrong!). Must wrap complex initializers in parens when inlining.

**Type annotation on declaration:** `const x: number = compute()` — after inlining, type annotation is gone. Usually fine.

### Fixtures to Add

#### Must Have

**1. used-multiple-times**
Variable used in multiple places — all sites replaced with initializer.
```ts
export const params = { file: "fixture.ts", target: "prefix" };

export function main(): string {
  const prefix = "Hello";
  const a = prefix + " Alice";
  const b = prefix + " Bob";
  return a + ", " + b;
}
```
Expectation: `prefix` inlined to `"Hello"` at both sites.

**2. operator-precedence**
Initializer is a binary expression that needs parentheses when inlined into higher-precedence context.
```ts
export const params = { file: "fixture.ts", target: "sum" };

export function main(): string {
  const a = 3;
  const b = 4;
  const sum = a + b;
  return String(sum * 2);  // needs: (a + b) * 2, not a + b * 2
}
```
Expectation: inlined as `(a + b) * 2`. **This is a known bug in the current implementation** — it does raw text substitution without parenthesization.

**3. side-effect-initializer**
Initializer is a function call. Inlining at multiple sites changes semantics.
```ts
export const params = { file: "fixture.ts", target: "rand" };

let callCount = 0;
const getRandom = (): number => { callCount++; return 42; };

export function main(): string {
  const rand = getRandom();
  const a = rand + 1;
  const b = rand + 2;
  return String(a + b + callCount);
}
```
Expected behavior: Should either refuse (rand has a call expression initializer and is used multiple times) or inline (but will change semantics: `callCount` becomes 2 instead of 1). Document the expected behavior clearly.

**4. used-once**
Variable used exactly once — safe to inline unconditionally.
```ts
export const params = { file: "fixture.ts", target: "message" };

export function main(): string {
  const message = "Hello, World!";
  return message;
}
```
Expectation: Inlines cleanly. `return "Hello, World!"`.

**5. used-in-template**
Variable used inside a template literal interpolation.
```ts
export const params = { file: "fixture.ts", target: "name" };

export function main(): string {
  const name = "Alice";
  return `Hello, ${name}!`;
}
```
Expectation: Inlined as `` `Hello, ${"Alice"}!` ``. No operator precedence issue here.

**6. let-variable**
`let` variable (not just `const`).
```ts
export const params = { file: "fixture.ts", target: "temp" };

export function main(): string {
  let temp = 42;
  return String(temp);
}
```
Expectation: Should work same as `const`. Note: `let` means potentially reassigned — if it's reassigned before use, inlining gives wrong result. Precondition should check no reassignments between declaration and uses.

#### Should Have

**7. computed-initializer**
Complex initializer expression.
```ts
export const params = { file: "fixture.ts", target: "ratio" };

export function main(): string {
  const total = 100;
  const part = 30;
  const ratio = part / total;
  return ratio.toFixed(2);
}
```
Expectation: `ratio` inlined as `part / total`. Precedence: `(part / total).toFixed(2)` — needs parens if the property access has higher precedence than division. Actually `.toFixed` has precedence over `/`, so `part / total.toFixed(2)` would be wrong. Must parenthesize.

**8. in-condition**
Variable used in if condition.
```ts
export const params = { file: "fixture.ts", target: "isValid" };

export function main(): string {
  const score = 75;
  const isValid = score > 60;
  if (isValid) {
    return "pass";
  }
  return "fail";
}
```
Expectation: Inlined as `if (score > 60)`. No precedence issue here.

### Implementation Changes Required

1. **Operator precedence**: Wrap initializer in parens when the initializer is a binary/conditional expression and it's being inlined into a position where operator precedence would change semantics.
2. **Side-effect check**: If initializer contains a call expression AND the variable is referenced more than once → add a warning or refuse (configurable).
3. **Reassignment check**: If the target is `let` and is reassigned anywhere after declaration → refuse (or only inline at uses before the first reassignment).
