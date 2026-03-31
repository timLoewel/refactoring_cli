class Order:
    def __init__(self, amount: int, order_type: str) -> None:
        self.amount = amount
        self.order_type = order_type

    def charge(self) -> int:
        if self.order_type == "rush":
            return self.amount + 10
        elif self.order_type == "overnight":
            return self.amount + 20
        else:
            return self.amount
