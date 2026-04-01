export const params = { file: "fixture.ts", target: "Counter", field: "count", name: "total" };

class Counter {
  private count: number = 0;

  increment(): void {
    this.count += 1;
  }

  getValue(): number {
    return this.count;
  }
}

export function main(): string {
  const c = new Counter();
  c.increment();
  c.increment();
  return String(c.getValue());
}
