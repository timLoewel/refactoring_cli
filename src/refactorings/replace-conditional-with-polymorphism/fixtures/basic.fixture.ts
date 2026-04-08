export const params = { file: "fixture.ts", target: "getSpeed" };

function getSpeed(type: string): number {
  switch (type) {
    case "european":
      return 40;
    case "african":
      return 25;
    case "norwegian_blue":
      return 55;
    default:
      throw new Error(`Unknown type: ${type}`);
  }
}

export function main(): string {
  return String(getSpeed("european"));
}
