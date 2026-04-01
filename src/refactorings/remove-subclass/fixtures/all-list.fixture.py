params = {"file": "fixture.py", "target": "RushOrder"}

__all__ = ["Order", "RushOrder"]


class Order:
    def __init__(self, amount: int) -> None:
        self.amount = amount

    def total(self) -> int:
        return self.amount


class RushOrder(Order):
    def rush_fee(self) -> float:
        return self.amount * 0.1


def main() -> str:
    order = RushOrder(100)
    return f"total={order.total()}, fee={order.rush_fee()}"
