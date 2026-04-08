export const params = {
  file: "fixture.ts",
  target: "PremiumBooking",
  delegateClassName: "PremiumDelegate",
};

class Booking {
  label(): string {
    return "standard booking";
  }
}

class PremiumBooking extends Booking {
  extras(): string {
    return "breakfast included";
  }
}

export function main(): string {
  const booking = new PremiumBooking();
  return String(booking.extras());
}
