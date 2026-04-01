import { formatCurrency } from "./utils";

export function formatPrice(price: number): string {
  return formatCurrency(price);
}

export function otherStuff(): string {
  return "other";
}
