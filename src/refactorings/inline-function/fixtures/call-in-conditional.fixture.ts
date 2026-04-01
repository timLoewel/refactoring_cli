export const params = { file: "fixture.ts", target: "isReady" };

function isReady(): boolean {
  return true;
}

export function main(): string {
  if (isReady()) {
    return "ready";
  }
  return "not ready";
}
