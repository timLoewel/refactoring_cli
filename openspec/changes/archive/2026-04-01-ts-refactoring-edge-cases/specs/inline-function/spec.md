## Inline Function — Edge Case Fixtures

### Context

Current: 1 fixture (`basic` — void function with no params, called as standalone statements).
The implementation has structural limitations: no parameter substitution, only inlines ExpressionStatement call sites, silently removes the function even when not all call sites are replaced.

### Critical Architecture Issue

The current impl removes the function declaration (line 52) **regardless** of how many call sites were actually inlined. If any call site is in a non-ExpressionStatement position (assignment, conditional, template literal, etc.), the function is removed while the call site remains — producing a ReferenceError at runtime.

**This must be fixed first:** either refuse if not all call sites can be inlined, or inline all call site forms.

### Fixtures to Add

#### Must Have

**1. with-parameters**
Function takes parameters. The inlined body must substitute parameter references with the call arguments.
```ts
export const params = { file: "fixture.ts", target: "add" };

function add(a: number, b: number): number {
  return a + b;
}

export function main(): string {
  const result = add(3, 4);
  return String(result);
}
```
Expectation: `add(3, 4)` inlined to `3 + 4` (or `const result = 3 + 4`). Current impl: FAILS — body text contains `a + b` with no substitution, and call site is not ExpressionStatement so it's skipped, then function is removed → ReferenceError.

**2. return-value-used**
Function returns a value captured in a variable.
```ts
export const params = { file: "fixture.ts", target: "double" };

function double(x: number): number {
  return x * 2;
}

export function main(): string {
  const a = double(5);
  const b = double(3);
  return String(a + b);
}
```
Expectation: Each call site replaced with the expression `x * 2` (with x substituted). Two call sites, both are variable declarations.

**3. single-expression-arrow**
Arrow function stored in const with expression body.
```ts
export const params = { file: "fixture.ts", target: "square" };

const square = (n: number): number => n * n;

export function main(): string {
  const a = square(4);
  const b = square(3);
  return String(a + b);
}
```
Expectation: Arrow functions should be inlinable. Current impl: FAILS — only searches FunctionDeclaration, not VariableDeclaration with arrow.

**4. multi-statement-body**
Function body has multiple statements (not just a single return).
```ts
export const params = { file: "fixture.ts", target: "process" };

function process(x: number): number {
  const doubled = x * 2;
  const incremented = doubled + 1;
  return incremented;
}

export function main(): string {
  const result = process(5);
  return String(result);
}
```
Expectation: Multi-statement body is harder to inline into an expression position. Options: (a) extract to a block expression/IIFE, (b) hoist statements before the assignment, (c) refuse. For now, **refusing** with a clear precondition error is acceptable.

**5. void-multiple-call-sites**
Multiple call sites of a void function — the basic case but with more call sites.
```ts
export const params = { file: "fixture.ts", target: "log" };

function log(msg: string): void {
  console.log(msg);
}

export function main(): string {
  log("start");
  log("middle");
  log("end");
  return "done";
}
```
Expectation: All three call sites replaced with `console.log(msg)` where `msg` is substituted with the argument. Tests parameter substitution for void functions.

**6. call-in-expression (precondition rejection)**
Function called inside an expression where inlining is not straightforward.
```ts
export const params = { file: "fixture.ts", target: "getValue" };

function getValue(): number {
  return 42;
}

export function main(): string {
  const result = getValue() + 1;
  return String(result);
}
```
Expectation: Current behavior would silently break. After fix, should either: inline the expression body (`42 + 1`), or refuse with clear error. For single-expression return bodies, inlining is feasible.

#### Should Have

**7. recursive (precondition rejection)**
Recursive function — cannot be inlined.
```ts
export const params = { file: "fixture.ts", target: "factorial" };

function factorial(n: number): number {
  return n <= 1 ? 1 : n * factorial(n - 1);
}

export function main(): string {
  return String(factorial(5));
}
```
Expectation: Precondition error — function calls itself, inlining would create infinite expansion.

**8. method-call (precondition rejection)**
Function is called as a method — inlining doesn't apply to method calls on objects.
```ts
export const params = { file: "fixture.ts", target: "greet" };

function greet(): string {
  return "hello";
}

export function main(): string {
  const obj = { greet };
  const a = greet();
  const b = obj.greet();  // method call — should warn or handle
  return a + b;
}
```
Expectation: Direct call `greet()` is inlined. `obj.greet()` cannot be trivially inlined because the function identity is used as a method. Should either: refuse the entire refactoring (safest), or only inline direct calls and leave `obj.greet()` (but then must keep the function).

**9. with-default-parameters**
Function has default parameter values.
```ts
export const params = { file: "fixture.ts", target: "greet" };

function greet(name: string = "World"): string {
  return `Hello, ${name}!`;
}

export function main(): string {
  const a = greet();
  const b = greet("Alice");
  return a + " " + b;
}
```
Expectation: `greet()` should inline with `name = "World"`, `greet("Alice")` with `name = "Alice"`. Default values need handling during parameter substitution.

**10. async-function**
Async function with await.
```ts
export const params = { file: "fixture.ts", target: "delay" };

async function delay(ms: number): Promise<string> {
  await new Promise(resolve => setTimeout(resolve, ms));
  return "done";
}

export async function main(): Promise<string> {
  const result = await delay(0);
  return result;
}
```
Expectation: Async function can be inlined if call site is already in async context with await. The inlined body's `await` expressions remain valid. Alternatively, refuse if too complex.

**11. function-expression**
Function expression (not declaration) stored in const.
```ts
export const params = { file: "fixture.ts", target: "transform" };

const transform = function(x: number): number {
  return x * 10;
};

export function main(): string {
  return String(transform(5));
}
```
Expectation: Function expressions should be inlinable same as arrow functions.

#### Nice to Have

**12. call-in-template-literal**
Function called inside template literal interpolation.
```ts
export const params = { file: "fixture.ts", target: "getName" };

function getName(): string {
  return "World";
}

export function main(): string {
  return `Hello, ${getName()}!`;
}
```
Expectation: Inline single-expression return into template: `` `Hello, ${"World"}!` `` or simplified to `` `Hello, World!` ``.

**13. call-in-conditional**
Function called in if condition.
```ts
export const params = { file: "fixture.ts", target: "isReady" };

function isReady(): boolean {
  return true;
}

export function main(): string {
  if (isReady()) {
    return "ready";
  }
  return "not ready";
}
```
Expectation: Inline single-expression return into condition: `if (true) { ... }`.

### Implementation Changes Required

1. **Preconditions — add checks for:**
   - Function calls itself (recursive) → refuse
   - Function is a generator → refuse
   - Not all call sites are ExpressionStatement AND function has multi-statement body → refuse
   - Function is passed as value (not called) → refuse

2. **Parameter substitution:**
   - Map function parameter names to call-site argument expressions
   - Replace parameter identifiers in body text with argument text
   - Handle default parameters: if arg is missing, use default value

3. **Return value handling:**
   - Single `return <expr>;` body → inline as expression
   - Multi-statement body with final return → hoist statements, assign return value
   - Void body → inline as statements (current behavior)

4. **Function form support:**
   - Search VariableDeclaration with ArrowFunction/FunctionExpression initializer (not just FunctionDeclaration)

5. **Safety:**
   - Never remove the function if any call site was not inlined
   - Count expected vs actual inlines, report if mismatch
