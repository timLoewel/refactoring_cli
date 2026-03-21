let priority: string = "high";

export function main(): string {
  priority = "low";
  return `Priority is: ${priority}`;
}
