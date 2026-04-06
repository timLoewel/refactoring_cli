## Replace Temp With Query — Edge Case Fixtures

### Context

Current: 1 fixture (`basic`). **Critical bug found:** implementation hardcodes `function ${funcName}(): number` — always generates `number` as return type regardless of the actual initializer type.

### Critical Bug

```ts
// Current implementation (line ~90):
sf.insertStatements(0, `function ${funcName}(): number {\n  return ${initText};\n}\n`);
//                                              ^^^^^^ hardcoded!
```

If the variable holds a string, boolean, object, or array — the generated function has wrong return type, causing TypeScript compilation errors.

### Fixtures to Add

#### Must Have

**1. string-type**
Variable holds a string — generated function must return `string`, not `number`.
```ts
export const params = { file: "fixture.ts", target: "greeting", name: "getGreeting" };

export function main(): string {
  const name = "Alice";
  const greeting = "Hello, " + name;
  const result = greeting + "!";
  return result;
}
```
Expectation: `function getGreeting(): string { return "Hello, " + name; }`. Currently generates `(): number` — **compilation error**.

**2. boolean-type**
Variable holds a boolean.
```ts
export const params = { file: "fixture.ts", target: "isValid", name: "checkValid" };

export function main(): string {
  const score = 75;
  const isValid = score >= 60;
  return isValid ? "pass" : "fail";
}
```
Expectation: `function checkValid(): boolean { return score >= 60; }`. Currently: `(): number` — **compilation error**.

**3. numeric-type** (already works by accident)
Variable holds a number — this is the current implicit assumption.
```ts
export const params = { file: "fixture.ts", target: "discount", name: "getDiscount" };

export function main(): string {
  const price = 100;
  const discount = price * 0.1;
  return String(price - discount);
}
```
Expectation: `function getDiscount(): number { return price * 0.1; }`. This one works currently.

**4. array-type**
Variable holds an array.
```ts
export const params = { file: "fixture.ts", target: "doubled", name: "getDoubled" };

export function main(): string {
  const nums = [1, 2, 3];
  const doubled = nums.map(n => n * 2);
  return doubled.join(",");
}
```
Expectation: `function getDoubled(): number[] { return nums.map(n => n * 2); }`.

**5. multiple-references**
Temp variable used more than once — all replaced with function calls.
```ts
export const params = { file: "fixture.ts", target: "tax", name: "calculateTax" };

export function main(): string {
  const price = 200;
  const tax = price * 0.08;
  const withTax = price + tax;
  const displayTax = tax.toFixed(2);
  return `${withTax} (tax: ${displayTax})`;
}
```
Expectation: Both `tax` references replaced with `calculateTax()`.

#### Should Have

**6. in-class-method**
Temp variable inside a class method.
```ts
export const params = { file: "fixture.ts", target: "area", name: "getArea" };

class Rectangle {
  constructor(public width: number, public height: number) {}
  
  describe(): string {
    const area = this.width * this.height;
    return `Area: ${area}`;
  }
}

export function main(): string {
  const rect = new Rectangle(3, 4);
  return rect.describe();
}
```
Expectation: `getArea()` extracted — but where? As a method on the class, or as a top-level function? Current impl inserts at position 0 (top of file), which would be outside the class — and `this.width * this.height` would be invalid there.

**7. with-outer-scope-reference**
Initializer references variables from outer scope — extracted function needs them as parameters.
```ts
export const params = { file: "fixture.ts", target: "result", name: "compute" };

export function main(): string {
  const base = 10;
  const multiplier = 3;
  const result = base * multiplier;
  return String(result);
}
```
Expectation: `function compute(base: number, multiplier: number): number { return base * multiplier; }`. The extracted function needs parameters since `base` and `multiplier` aren't in global scope. Current impl: generates function with no parameters — `result` reference in body would be undefined at runtime.

### Implementation Changes Required

1. **Return type inference**: Infer return type from variable's type annotation or initializer type via ts-morph's type checker.
2. **Outer scope variables → parameters**: Same scope analysis as extract-function — variables read in the initializer that aren't in file scope need to become function parameters.
3. **Call site updates**: If parameters are added, all call sites must pass them: `calculateTax()` → `calculateTax(price)`.
