params = {"file": "fixture.py", "target": "Currency"}


class Currency:
    def __init__(self, code: str, symbol: str) -> None:
        self.code = code
        self.symbol = symbol

    def format(self, amount: float) -> str:
        return f"{self.symbol}{amount:.2f}"


def main() -> str:
    usd = Currency("USD", "$")
    eur = Currency("EUR", "\u20ac")
    return f"{usd.format(10.5)} {eur.format(8.0)}"
