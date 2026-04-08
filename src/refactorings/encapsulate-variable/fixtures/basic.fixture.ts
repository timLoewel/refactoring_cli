export const params = { file: "fixture.ts", target: "defaultOwner" };

let defaultOwner: string = "Martin";

export function main(): string {
  defaultOwner = "Alice";
  return `Owner is: ${defaultOwner}`;
}
