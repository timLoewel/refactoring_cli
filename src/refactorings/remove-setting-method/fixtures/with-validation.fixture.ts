// No params: the setter contains validation logic that would be silently
// discarded by remove-setting-method; removing it changes observable behaviour.

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
