export const params = { file: "fixture.ts", target: "getName" };

function getName(): string {
  return "World";
}

export function main(): string {
  return `Hello, ${getName()}!`;
}
