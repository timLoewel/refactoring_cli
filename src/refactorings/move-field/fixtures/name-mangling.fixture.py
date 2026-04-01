params = {"file": "fixture.py", "target": "Account", "field": "credit_limit", "destination": "Ledger", "via": "ledger"}


class Ledger:
    def __init__(self) -> None:
        pass


class Account:
    def __init__(self, owner: str) -> None:
        self.owner = owner
        self.credit_limit = 1000.0
        self.__secret = "hidden"
        self.ledger = Ledger()

    def info(self) -> str:
        return f"{self.owner}: {self.credit_limit} ({self.__secret})"


def main() -> str:
    a = Account("Alice")
    return a.info()
