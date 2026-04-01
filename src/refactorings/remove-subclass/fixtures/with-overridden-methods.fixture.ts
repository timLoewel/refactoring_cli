// No params: subclass overrides a parent method — remove-subclass copies the member into the parent
// verbatim, resulting in a duplicate method implementation. Known limitation.

class Shipping {
  label(): string {
    return "standard";
  }
}

class ExpressShipping extends Shipping {
  label(): string {
    return "express";
  }
}

export function main(): string {
  const ship = new ExpressShipping();
  return `shipping: ${ship.label()}`;
}
