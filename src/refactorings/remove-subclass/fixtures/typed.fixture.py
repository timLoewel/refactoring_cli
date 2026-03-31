params = {"file": "fixture.py", "target": "PremiumCustomer"}


class Customer:
    def __init__(self, name: str) -> None:
        self.name = name

    def greeting(self) -> str:
        return f"Hello, {self.name}"


class PremiumCustomer(Customer):
    def discount(self) -> float:
        return 0.2


def get_discount(customer: PremiumCustomer) -> float:
    return customer.discount()


def main() -> str:
    c: PremiumCustomer = PremiumCustomer("Alice")
    d = get_discount(c)
    return f"discount={d}"
