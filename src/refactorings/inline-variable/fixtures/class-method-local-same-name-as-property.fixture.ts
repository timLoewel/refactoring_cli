// Regression: inlining a local variable in a class method whose name
// matches a constructor-promoted property (e.g. `private state`) must
// only replace references to the local variable, not the class property.
export const params = { file: "fixture.ts", target: "state" };

interface MatchState<T> {
  matched: boolean;
  value?: T;
}

const unmatched: MatchState<never> = { matched: false };

class MatchExpression<I, O> {
  constructor(
    private input: I,
    private state: MatchState<O>,
  ) {}

  with(pattern: I, handler: (val: I) => O): MatchExpression<I, O> {
    if (this.state.matched) return this;

    const matched = this.input === pattern;
    const state = matched
      ? { matched: true as const, value: handler(this.input) }
      : unmatched;

    return new MatchExpression(this.input, state);
  }

  run(): O | undefined {
    return this.state.value;
  }
}

export function main(): string {
  const result = new MatchExpression<string, string>("hello", unmatched)
    .with("hello", (v) => v + " world")
    .with("bye", (v) => v + " universe")
    .run();
  return result ?? "none";
}
