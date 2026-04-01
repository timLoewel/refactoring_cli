export const params = { file: "fixture.ts", target: "taxRate" };

let taxRate: number = 0.2;

export function main(): string {
  return "tax-encapsulated";
}
