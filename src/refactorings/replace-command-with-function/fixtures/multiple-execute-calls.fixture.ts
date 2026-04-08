// Multiple execute() calls — doesn't translate cleanly to a plain function.

export const params = { file: "fixture.ts", target: "CounterCommand", expectRejection: true };

class CounterCommand {
  private readonly step: number;
  constructor(step: number) {
    this.step = step;
  }
  execute(): number {
    return this.step * 2;
  }
}

export function main(): string {
  const cmd = new CounterCommand(3);
  const a = cmd.execute();
  const b = cmd.execute();
  return `${a},${b}`;
}
