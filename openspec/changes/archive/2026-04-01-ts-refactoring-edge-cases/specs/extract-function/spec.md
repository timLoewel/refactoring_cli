## Extract Function — Edge Case Fixtures

### Context

Current: 1 fixture (`basic` — top-level void statements with no outer-scope references).
The implementation is minimal: no scope analysis, no parameter inference, no return value handling, no support for extracting from within function bodies. Generates `function name(): void { ... }` always.

### Fixtures to Add

#### Must Have

**1. reads-outer-variable**
Extracted code references a variable declared above the extraction range. That variable must become a parameter of the extracted function.
```ts
export const params = {
  file: "fixture.ts", startLine: 3, endLine: 3, name: "computeResult"
};

export function main(): string {
  const factor = 5;
  const input = 7;
  const result = factor * input;
  return String(result);
}
```
Expectation: `result = factor * input` is extracted. `factor` and `input` are from outer scope → become parameters. Call becomes `const result = computeResult(factor, input)`. Current impl: FAILS — generates `function computeResult(): void { const result = factor * input; }` where `factor` and `input` are captured via closure (works at top level but wrong design), and `result` is trapped inside.

**2. produces-return-value**
Extracted code computes a value that is used after the extraction range. The extracted function must return that value.
```ts
export const params = {
  file: "fixture.ts", startLine: 2, endLine: 3, name: "computeSum"
};

export function main(): string {
  const a = 3;
  const b = 7;
  const sum = a + b;
  return String(sum);
}
```
Expectation: Lines 2-3 extracted. `sum` is used on line 4 → function must return it. Call becomes `const sum = computeSum(a)` or similar. `a` is from outer scope → parameter. `b` is declared inside extraction range and not used outside → stays internal.

Actually wait — `a` is line 1 (inside `main`), `b` is line 2. Let me reconsider the line numbers. The point is: at least one variable declared in the extraction range is used after it.

**3. inside-function-body**
Extracting statements from within a function body (not top-level file statements). This is the most common real-world use case.
```ts
export const params = {
  file: "fixture.ts", startLine: 4, endLine: 5, name: "formatOutput"
};

export function main(): string {
  const items = [1, 2, 3];
  const total = items.reduce((a, b) => a + b, 0);
  const label = "Total";
  const output = `${label}: ${total}`;
  return output;
}
```
Expectation: Lines 4-5 extracted to a function. `label` and `total` are from outer scope → parameters. `output` is used on line 6 → return value. Current impl: FAILS — `sf.getStatements()` only returns top-level statements; `main` is one statement, and lines 4-5 are inside it.

**4. void-side-effects**
Extracted code has only side effects, no return value needed. This is what the current "basic" fixture tests, but with outer-scope variable references.
```ts
export const params = {
  file: "fixture.ts", startLine: 3, endLine: 4, name: "logDetails"
};

const messages: string[] = [];

export function main(): string {
  const name = "Alice";
  const age = 30;
  messages.push(`Name: ${name}`);
  messages.push(`Age: ${age}`);
  return messages.join(", ");
}
```
Expectation: Side-effect statements extracted. `name`, `age`, `messages` are all from outer scope → parameters (or closures for module-level `messages`). No return value needed.

**5. async-context**
Extracted code contains `await` — the extracted function must be `async`.
```ts
export const params = {
  file: "fixture.ts", startLine: 2, endLine: 3, name: "fetchData"
};

export async function main(): Promise<string> {
  const url = "https://example.com";
  const response = await fetch(url);
  const text = await response.text();
  return text.slice(0, 10);
}
```
Expectation: Extracted function is `async function fetchData(url)` with `Promise<string>` return. Call becomes `const text = await fetchData(url)`. Current impl: FAILS — generates non-async function, `await` becomes syntax error.

**6. multiple-variables-escape**
Multiple variables declared in the extraction range are used after it. The extracted function must return them as a tuple/object.
```ts
export const params = {
  file: "fixture.ts", startLine: 2, endLine: 3, name: "parse"
};

export function main(): string {
  const input = "John,30";
  const name = input.split(",")[0];
  const age = parseInt(input.split(",")[1]);
  return `${name} is ${age}`;
}
```
Expectation: Both `name` and `age` are declared in extraction range and used after. Function must return both: `const { name, age } = parse(input)` or `const [name, age] = parse(input)`. This is a harder case.

#### Should Have

**7. loop-break-reject**
Extracted code contains `break` or `continue` referring to an enclosing loop. Cannot be extracted.
```ts
export const params = {
  file: "fixture.ts", startLine: 3, endLine: 3, name: "checkItem"
};

export function main(): string {
  const items = [1, 2, 3, -1, 5];
  for (const item of items) {
    if (item < 0) break;
  }
  return "done";
}
```
Expectation: Precondition rejection — `break` cannot be moved to a separate function.

**8. this-context**
Extracted code references `this` — extracted function needs to preserve `this` binding (e.g., become a method or use `.call()`).
```ts
export const params = {
  file: "fixture.ts", startLine: 6, endLine: 7, name: "computeTotal"
};

class Cart {
  items: number[] = [10, 20, 30];

  getTotal(): string {
    const sum = this.items.reduce((a, b) => a + b, 0);
    const formatted = `$${sum.toFixed(2)}`;
    return formatted;
  }
}

export function main(): string {
  const cart = new Cart();
  return cart.getTotal();
}
```
Expectation: Extracted code uses `this.items`. If extracted to a standalone function, `this` is lost. Should either: extract as a method on the class, or pass `this` explicitly.

**9. single-expression**
Extracting a single expression (not a full statement). Useful for complex expressions.
```ts
export const params = {
  file: "fixture.ts", startLine: 3, endLine: 3, name: "computePrice"
};

export function main(): string {
  const basePrice = 100;
  const taxRate = 0.08;
  const total = basePrice * (1 + taxRate) + (basePrice > 50 ? 0 : 5.99);
  return total.toFixed(2);
}
```
Expectation: Line 3 is one statement (`const total = ...`). The complex expression gets extracted into a function. `basePrice` and `taxRate` become parameters. `total` is the return value.

**10. mutation-of-outer-variable**
Extracted code modifies a `let` variable from outer scope. The modified value must be communicated back.
```ts
export const params = {
  file: "fixture.ts", startLine: 3, endLine: 5, name: "accumulate"
};

export function main(): string {
  const items = [1, 2, 3, 4, 5];
  let sum = 0;
  for (const item of items) {
    sum += item;
  }
  return String(sum);
}
```
Expectation: `sum` is mutated in the extraction range and used after. Options: return the new value (`sum = accumulate(items, sum)`), or refuse. Mutation handling is the hardest extraction case.

#### Nice to Have

**11. partial-expression-reject**
Attempting to extract a range that doesn't align with complete statements.
```ts
export const params = {
  file: "fixture.ts", startLine: 2, endLine: 2, name: "partial"
};

export function main(): string {
  const x = (1 + 2
    + 3);
  return String(x);
}
```
Expectation: If startLine/endLine splits a multi-line expression, should reject cleanly.

**12. generator-yield-reject**
Extracted code contains `yield` — cannot be extracted to a non-generator function.
```ts
// Would need generator function context
```
Expectation: Precondition rejection.

### Implementation Changes Required

1. **Nested statement extraction:**
   - Walk all descendants (not just `sf.getStatements()`) to find statements at the given line range
   - Determine enclosing function/block scope

2. **Scope analysis:**
   - Identify variables READ in the extraction range that are DECLARED outside it → parameters
   - Identify variables DECLARED in the extraction range that are READ after it → return values
   - Identify variables DECLARED in the extraction range that are WRITTEN after it → mutation (refuse or return)

3. **Return value inference:**
   - 0 escaping variables → void
   - 1 escaping variable → `return <var>`
   - N escaping variables → `return { var1, var2, ... }` with destructuring at call site

4. **Async detection:**
   - If any extracted statement contains `await`, mark extracted function as `async`
   - Call site becomes `await name()`

5. **Precondition checks:**
   - `break`/`continue` without enclosing loop in extraction range → refuse
   - `yield` without enclosing generator → refuse
   - `this` reference → warn or extract as method

6. **Type inference (stretch):**
   - Infer parameter types from outer variable declarations
   - Infer return type from escaping variable types
