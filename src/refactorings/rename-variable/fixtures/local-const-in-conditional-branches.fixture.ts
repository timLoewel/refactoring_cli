export const params = { file: "fixture.ts", target: "formattedKey", name: "__reftest__" };

class Formatter {
  property: string;
  children?: Formatter[];
  constraints?: Record<string, string>;

  constructor(property: string) {
    this.property = property;
  }

  format(parentPath: string): string {
    const formattedKey = Number.isInteger(+this.property)
      ? `[${this.property}]`
      : `${parentPath ? "." : ""}${this.property}`;

    if (this.constraints) {
      return `${parentPath}${formattedKey}: constrained`;
    }

    return this.children
      ? this.children.map((child) => child.format(`${parentPath}${formattedKey}`)).join("")
      : "";
  }
}

export function main(): string {
  const root = new Formatter("items");
  root.children = [new Formatter("0")];
  root.children[0]!.constraints = { min: "1" };
  return root.format("");
}
