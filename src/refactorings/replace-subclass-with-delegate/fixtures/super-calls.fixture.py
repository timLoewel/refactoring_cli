params = {"file": "fixture.py", "target": "LoggedOrder", "delegateClassName": "LogBehavior"}


class Order:
    def total(self) -> int:
        return 100


class LoggedOrder(Order):
    def __init__(self, amount: int) -> None:
        self.amount = amount

    def summary(self) -> str:
        base = super().total()
        return f"Order total: {base}"


def main() -> str:
    o = LoggedOrder(100)
    return o.summary()
