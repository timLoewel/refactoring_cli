export const params = {
  file: "fixture.ts",
  target: "minMaxDate",
  name: "boundedDate",
};

// Distilled from zod's src/benchmarks/primitives.ts: a module-level const
// initialized by a chained method-call expression, then referenced from inside
// several arrow-function callbacks passed to a fluent builder. Renaming the
// const must rewrite the declaration and every callback reference.
class Validator {
  private min = Number.NEGATIVE_INFINITY;
  private max = Number.POSITIVE_INFINITY;
  withMin(n: number): this {
    this.min = n;
    return this;
  }
  withMax(n: number): this {
    this.max = n;
    return this;
  }
  check(n: number): boolean {
    return n >= this.min && n <= this.max;
  }
}

function makeValidator(): Validator {
  return new Validator();
}

const minMaxDate = makeValidator().withMin(10).withMax(90);

function add(label: string, fn: () => boolean): string {
  return `${label}=${fn()}`;
}

export function main(): string {
  const valid = add("valid", () => minMaxDate.check(50));
  const low = add("low", () => minMaxDate.check(5));
  const high = add("high", () => minMaxDate.check(95));
  return [valid, low, high].join("|");
}
