export const params = { file: "fixture.ts", target: "selected", name: "picked" };

class Matcher<T> {
  constructor(private input: T) {}

  match(predicate: (value: T) => boolean, select: (key: string, value: T) => void): boolean {
    if (predicate(this.input)) {
      select("default", this.input);
      return true;
    }
    return false;
  }

  run(callback: (value: T) => string): string {
    let hasSelections = false;
    let selected: Record<string, unknown> = {};
    const select = (key: string, value: unknown) => {
      hasSelections = true;
      selected[key] = value;
    };

    const matched = this.match((v) => typeof v === "string", select);

    const selections = hasSelections
      ? "default" in selected
        ? selected["default"]
        : selected
      : this.input;

    return matched ? callback(selections as T) : "no match";
  }
}

export function main(): string {
  return new Matcher("hello").run((v) => String(v).toUpperCase());
}
