from __future__ import annotations

params = {"file": "fixture.py", "target": "Order", "fields": "address,city", "newClassName": "ShippingAddress"}


class Order:
    def __init__(self, item: str, address: str, city: str) -> None:
        self.item = item
        self.address = address
        self.city = city

    def label(self) -> str:
        return f"{self.item} → {self.address}, {self.city}"


def main() -> str:
    o = Order("Widget", "123 Main St", "Springfield")
    return o.label()
