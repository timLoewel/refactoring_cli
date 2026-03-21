function greet(): void {
  console.log("Hello");
  console.log("World");
}

export function main(): string {
  greet();
  greet();
  return "done";
}
