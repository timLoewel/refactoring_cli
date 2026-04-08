// Setter contains validation that would be silently discarded.

export const params = {
  file: "fixture.ts",
  target: "Temperature",
  field: "celsius",
  expectRejection: true,
};

class Temperature {
  private _celsius: number = 0;

  get celsius(): number {
    return this._celsius;
  }

  set celsius(value: number) {
    if (value < -273.15) throw new Error("Below absolute zero");
    this._celsius = value;
  }
}

export function main(): string {
  const t = new Temperature();
  t.celsius = 100;
  return String(t.celsius);
}
