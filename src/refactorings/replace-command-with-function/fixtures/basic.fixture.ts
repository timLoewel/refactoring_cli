export const params = {
  file: "fixture.ts",
  target: "Greeter",
};

class Greeter {
  private readonly name: string;

  constructor(name: string) {
    this.name = name;
  }

  execute(): string {
    return `Hello, ${this.name}!`;
  }
}

export function main(): string {
  const cmd = new Greeter("World");
  return cmd.execute();
}
