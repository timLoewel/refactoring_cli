// Regression: target matches a class binding identifier.
// The class declaration name must NOT be replaced — only references to the class.
export const params = { file: "fixture.ts", target: "Counter", name: "cls" };

class Counter {
  count = 0;
  increment() {
    this.count++;
  }
}

export function main(): number {
  const a = new Counter();
  const b = new Counter();
  a.increment();
  b.increment();
  b.increment();
  return a.count + b.count;
}
