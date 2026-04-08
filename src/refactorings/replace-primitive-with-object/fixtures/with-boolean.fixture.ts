export const params = { file: "fixture.ts", target: "enabled", className: "Enabled" };

const enabled: boolean = true;

export function main(): string {
  return String(enabled);
}
