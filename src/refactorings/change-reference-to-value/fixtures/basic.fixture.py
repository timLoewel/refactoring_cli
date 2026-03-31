params = {"file": "fixture.py", "target": "Money"}


class Money:
    def __init__(self, amount: float, currency: str) -> None:
        self.amount = amount
        self.currency = currency


def main() -> str:
    m = Money(100.0, "USD")
    return f"{m.amount} {m.currency}"
