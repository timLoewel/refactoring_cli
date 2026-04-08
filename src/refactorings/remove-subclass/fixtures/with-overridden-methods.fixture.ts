// Subclass overrides a parent method — duplicate method after merge. Known limitation.

export const params = { file: "fixture.ts", target: "ExpressShipping", expectRejection: true };

class Shipping {
  label(): string {
    return "standard";
  }
}

class ExpressShipping extends Shipping {
  override label(): string {
    return "express";
  }
}

export function main(): string {
  const ship = new ExpressShipping();
  return `shipping: ${ship.label()}`;
}
