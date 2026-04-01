export const params = {
  file: "fixture.ts",
  target: "PremiumBooking",
  delegateClassName: "PremiumBehavior",
};

class Booking {}

class PremiumBooking extends Booking {
  extras(): string {
    return "breakfast";
  }
  concierge(): string {
    return "24h concierge";
  }
}

export function main(): string {
  const b = new PremiumBooking();
  return `${String(b.extras())} — ${String(b.concierge())}`;
}
