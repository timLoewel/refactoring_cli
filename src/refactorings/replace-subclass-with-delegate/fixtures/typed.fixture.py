params = {"file": "fixture.py", "target": "PremiumCustomer", "delegateClassName": "PremiumBehavior"}


class Customer:
    def greeting(self) -> str:
        return "Hello"


class PremiumCustomer(Customer):
    def discount(self) -> float:
        return 0.2

    def vip_label(self) -> str:
        return "VIP Member"


def main() -> str:
    c = PremiumCustomer()
    return f"discount={c.discount()}, label={c.vip_label()}"
