let defaultOwner: string = "Martin";

export function main(): string {
  defaultOwner = "Alice";
  return `Owner is: ${defaultOwner}`;
}
