export function convert(x: number): string;
export function convert(x: string): number;
export function convert(x: number | string): string | number {
  return typeof x === "number" ? String(x) : parseInt(x);
}
