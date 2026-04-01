// No params: the implementation has a node-ordering bug when removing
// consecutive if-statements — it removes the first node before replacing it,
// causing a "node was removed" error at runtime.

function getDiscount(tier: string): number {
  if (tier === "gold") return 20;
  if (tier === "silver") return 20;
  return 0;
}

export function main(): string {
  return `${getDiscount("gold")},${getDiscount("silver")},${getDiscount("bronze")}`;
}
