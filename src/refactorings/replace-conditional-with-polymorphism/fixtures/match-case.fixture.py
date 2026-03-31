params = {"file": "fixture.py", "target": "Discount", "method": "apply"}


class Discount:
    def __init__(self, amount: int, discount_type: str) -> None:
        self.amount = amount
        self.discount_type = discount_type

    def apply(self) -> int:
        match self.discount_type:
            case "percentage":
                return self.amount - self.amount // 10
            case "fixed":
                return self.amount - 5
            case _:
                return self.amount


def main() -> str:
    d = Discount(100, "percentage")
    return f"total={d.apply()}"
