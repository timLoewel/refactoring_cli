params = {"file": "fixture.py", "target": "Payment", "typeField": "payment_type"}

CREDIT = "credit"
DEBIT = "debit"
CASH = "cash"


class Payment:
    def __init__(self, amount: int, payment_type: str) -> None:
        self.amount = amount
        self.payment_type = payment_type

    def fee(self) -> int:
        if self.payment_type == CREDIT:
            return 3
        elif self.payment_type == DEBIT:
            return 1
        else:
            return 0


def main() -> str:
    p = Payment(100, CREDIT)
    return f"fee={p.fee()}"
