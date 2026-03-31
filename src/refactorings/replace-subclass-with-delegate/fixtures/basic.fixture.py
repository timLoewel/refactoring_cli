params = {"file": "fixture.py", "target": "PremiumBooking", "delegateClassName": "PremiumBookingDelegate"}


class Booking:
    def label(self) -> str:
        return "Standard Booking"


class PremiumBooking(Booking):
    def extras(self) -> str:
        return "breakfast included"


def main() -> str:
    booking = PremiumBooking()
    return booking.extras()
