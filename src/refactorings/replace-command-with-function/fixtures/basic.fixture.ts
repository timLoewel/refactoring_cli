export function main(): string {
  const cmd = new Greeter("World");
  return cmd.execute();
}

class Greeter {
  private readonly name: string;

  constructor(name: string) {
    this.name = name;
  }

  execute(): string {
    return `Hello, ${this.name}!`;
  }
}
