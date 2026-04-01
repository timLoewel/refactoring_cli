export const params = { file: "fixture.ts", target: "getLabel" };

function getLabel(active: boolean): string {
  if (active) {
    return "active";
  } else {
    return "inactive";
  }
}

export function main(): string {
  return `${getLabel(true)},${getLabel(false)}`;
}
