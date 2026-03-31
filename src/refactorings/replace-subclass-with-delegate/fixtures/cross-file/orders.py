class Order:
    def total(self) -> int:
        return 0


class RushOrder(Order):
    def rush_fee(self) -> float:
        return 10.0
