export const params = {
  file: "fixture.ts",
  target: "Counter",
  field: "value",
};

class Counter {
  private _value: number;

  constructor(initial: number) {
    this._value = initial;
  }

  get value(): number {
    return this._value;
  }

  set value(v: number) {
    this._value = v;
  }
}

export function main(): string {
  const counter = new Counter(5);
  return `count: ${counter.value}`;
}
