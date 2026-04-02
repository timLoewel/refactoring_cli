import { formatCurrency } from "./utils.js";

export function formatPrice(price: number): string {
  return formatCurrency(price);
}

export function otherStuff(): string {
  return "other";
}
