// Command class with state built up in constructor before execute().
export const params = { file: "fixture.ts", target: "GreetCommand" };

class GreetCommand {
  private readonly name: string;
  constructor(name: string) {
    this.name = name;
  }
  execute(): string {
    return `Hello, ${this.name}!`;
  }
}

export function main(): string {
  return "function-from-command-ready";
}
