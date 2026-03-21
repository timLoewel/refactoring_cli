export function main(): string {
  class Booking {
    date: string;
    constructor(date: string) {
      this.date = date;
    }
    label(): string {
      return `Booking on ${this.date}`;
    }
  }

  class PremiumBooking extends Booking {
    extras(): string {
      return "breakfast included";
    }
  }

  const booking = new PremiumBooking("2026-03-21");
  return `${booking.label()} — ${booking.extras()}`;
}
