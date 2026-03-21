export function main(): string {
  const counter = new Counter(0);
  counter.setValue(5);
  return `count: ${counter.getValue()}`;
}

class Counter {
  private value: number;

  constructor(initial: number) {
    this.value = initial;
  }

  getValue(): number {
    return this.value;
  }

  set value2(v: number) {
    this.value = v;
  }

  setValue(v: number): void {
    this.value = v;
  }
}
