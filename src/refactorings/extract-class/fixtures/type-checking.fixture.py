from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from decimal import Decimal

params = {"file": "fixture.py", "target": "Invoice", "fields": "amount,currency", "newClassName": "Money"}


class Invoice:
    def __init__(self, ref: str, amount: float, currency: str) -> None:
        self.ref = ref
        self.amount = amount
        self.currency = currency

    def display(self) -> str:
        return f"{self.ref}: {self.amount} {self.currency}"


def main() -> str:
    inv = Invoice("INV-001", 99.99, "USD")
    return inv.display()
