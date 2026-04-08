export const params = { file: "fixture.ts", target: "priority", className: "Priority" };

let priority: string = "high";

export function main(): string {
  priority = "low";
  return `Priority is: ${priority}`;
}
