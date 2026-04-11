export const params = { file: "fixture.ts", target: "unexpectedValueHandler", name: "errorHandler" };

const defaultCatcher = (val: unknown): never => {
  throw new Error(String(val));
};

class MatchExpression {
  private input: string;
  constructor(input: string) {
    this.input = input;
  }

  exhaustive(unexpectedValueHandler = defaultCatcher): string {
    return String(unexpectedValueHandler(this.input));
  }
}

export function main(): string {
  try {
    new MatchExpression("test").exhaustive();
    return "no-throw";
  } catch {
    return "threw";
  }
}
