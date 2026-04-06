export const params = { file: "fixture.ts", target: "4" };

function getDiscount(tier: string): number {
  if (tier === "gold") return 20;
  if (tier === "silver") return 20;
  return 0;
}

export function main(): string {
  return `${getDiscount("gold")},${getDiscount("silver")},${getDiscount("bronze")}`;
}
