export const params = {
  file: "fixture.ts",
  target: "processOrder",
  firstPhaseName: "parseOrder",
  secondPhaseName: "formatOrder",
};

const log: string[] = [];

function processOrder(orderId: string): void {
  log.push(`parsing:${orderId}`);
  log.push(`formatted:${orderId.toUpperCase()}`);
}

export function main(): string {
  log.length = 0;
  processOrder("abc");
  return log.join(",");
}
