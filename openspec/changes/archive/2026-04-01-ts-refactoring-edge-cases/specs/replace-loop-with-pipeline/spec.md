## Replace Loop With Pipeline — Edge Case Fixtures

### Context

Current: 1 fixture (`basic` — for-of with `arr.push(n * 2)` → `.map()`). Implementation handles: single `push` → `.map()` or identity spread, multiple/other statements → `.forEach()`. Only processes `for-of` loops.

### Key Concerns

**Loop forms not handled:** `for (let i = 0; i < n; i++)`, `for-in`, `while` — none of these are ForOfStatement nodes. Current precondition refuses them cleanly (`No for-of loop found at line X`).

**Filter pattern:** `if (pred) { arr.push(x) }` → `.filter()` then possibly `.map()`. Not handled — falls through to `.forEach()`.

**Async for-of:** `for await (const x of asyncIter)` — different semantics, shouldn't become `.forEach()`.

**Destructuring loop variable:** `for (const { a, b } of items)` — the var name extraction `replace(/^(const|let|var)\s+/, "")` produces `{ a, b }` which is correct for the arrow parameter.

### Fixtures to Add

#### Must Have

**1. map-with-expression** (covered by basic, but with non-trivial mapping)
```ts
export const params = { file: "fixture.ts", target: "4" };

export function main(): string {
  const prices = [10, 20, 30];
  const withTax: number[] = [];
  for (const price of prices) {
    withTax.push(price * 1.1);
  }
  return withTax.map(p => p.toFixed(2)).join(",");
}
```
Expectation: `→ const withTax = prices.map((price) => price * 1.1);`

**2. foreach-multiple-statements**
Loop body has multiple statements — must become `.forEach()`.
```ts
export const params = { file: "fixture.ts", target: "4" };

const log: string[] = [];

export function main(): string {
  const items = ["a", "b", "c"];
  for (const item of items) {
    const upper = item.toUpperCase();
    log.push(upper);
  }
  return log.join(",");
}
```
Expectation: `.forEach((item) => { const upper = item.toUpperCase(); log.push(upper); })`

**3. destructuring-loop-var**
Loop variable is destructured.
```ts
export const params = { file: "fixture.ts", target: "4" };

export function main(): string {
  const pairs = [{ a: 1, b: 2 }, { a: 3, b: 4 }];
  const sums: number[] = [];
  for (const { a, b } of pairs) {
    sums.push(a + b);
  }
  return sums.join(",");
}
```
Expectation: `const sums = pairs.map(({ a, b }) => a + b);` — destructuring in parameter works.

**4. loop-with-if-filter**
Body has `if (pred) push(x)` — the filter → map chain.
```ts
export const params = { file: "fixture.ts", target: "4" };

export function main(): string {
  const nums = [1, 2, 3, 4, 5, 6];
  const evens: number[] = [];
  for (const n of nums) {
    if (n % 2 === 0) {
      evens.push(n);
    }
  }
  return evens.join(",");
}
```
Expectation ideally: `const evens = nums.filter((n) => n % 2 === 0);`. Falls back to `.forEach()` currently.

**5. identity-copy**
Loop just copies array: `arr.push(item)` with no transformation.
```ts
export const params = { file: "fixture.ts", target: "4" };

export function main(): string {
  const src = [1, 2, 3];
  const copy: number[] = [];
  for (const item of src) {
    copy.push(item);
  }
  return copy.join(",");
}
```
Expectation: `const copy = [...src];` — identity copy becomes spread.

**6. for-in-rejection**
`for-in` loop — should fail precondition clearly.
```ts
export const params = { file: "fixture.ts", target: "3" };

export function main(): string {
  const obj: Record<string, number> = { a: 1, b: 2 };
  const keys: string[] = [];
  for (const key in obj) {
    keys.push(key);
  }
  return keys.join(",");
}
```
Expectation: Precondition error — no for-of at line 3.

**7. indexed-for-rejection**
Traditional `for (let i = 0; ...)` loop — should fail precondition.
```ts
export const params = { file: "fixture.ts", target: "3" };

export function main(): string {
  const items = [1, 2, 3];
  const result: number[] = [];
  for (let i = 0; i < items.length; i++) {
    result.push(items[i]! * 2);
  }
  return result.join(",");
}
```
Expectation: Precondition error — no for-of at line 3.

#### Should Have

**8. nested-loop**
Inner for-of inside outer for-of. Target is specific line.
```ts
export const params = { file: "fixture.ts", target: "5" };

export function main(): string {
  const matrix = [[1, 2], [3, 4]];
  const flat: number[] = [];
  for (const row of matrix) {
    for (const cell of row) {
      flat.push(cell);
    }
  }
  return flat.join(",");
}
```
Expectation: Inner loop (line 5) converted; outer loop unchanged.

**9. loop-with-break**
Loop has `break` — cannot be a simple pipeline.
```ts
export const params = { file: "fixture.ts", target: "3" };

export function main(): string {
  const items = [1, 2, 3, 4, 5];
  const result: number[] = [];
  for (const item of items) {
    if (item > 3) break;
    result.push(item);
  }
  return result.join(",");
}
```
Expectation: Either a `.forEach()` (losing the break semantics — wrong!) or precondition rejection. Current impl would produce incorrect `.forEach()` — should refuse.

### Implementation Changes Required

1. **Filter pattern**: Detect `if (pred) arr.push(x)` → generate `.filter(pred).map(x)` (or just `.filter()` if x === item).
2. **Break/continue detection**: If loop body contains `break` or `continue`, refuse (can't trivially pipeline).
3. **Async for-of**: Check for `for await (const x of ...)` — refuse or handle separately.
