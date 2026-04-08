export const params = {
  file: "fixture.ts",
  target: "Calculator",
  methods: "add, subtract",
  superclassName: "MathBase",
};

class Calculator {
  add(a: number, b: number): number {
    return a + b;
  }
  subtract(a: number, b: number): number {
    return a - b;
  }
  multiply(a: number, b: number): number {
    return a * b;
  }
}

export function main(): string {
  const calc = new Calculator();
  return `${calc.add(2, 3)} ${calc.subtract(5, 1)} ${calc.multiply(3, 4)}`;
}
