export const params = { file: "fixture.ts", target: "handler", name: "callback" };

class Processor {
  private input: string;
  constructor(input: string) {
    this.input = input;
  }

  run(...args: any[]): string {
    const handler: (value: string) => string = args[args.length - 1];
    const result = handler(this.input);
    return result;
  }
}

export function main(): string {
  return new Processor("hello").run((v: string) => v.toUpperCase());
}
