from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from collections.abc import Mapping

params = {"file": "fixture.py", "target": "Address", "into": "Customer"}


class Address:
    def __init__(self, street: str, city: str) -> None:
        self.street = street
        self.city = city

    def formatted(self) -> str:
        return f"{self.street}, {self.city}"


class Customer:
    def __init__(self, name: str, street: str, city: str) -> None:
        self.name = name
        self._addr = Address(street, city)

    def label(self) -> str:
        return f"{self.name}: {self._addr.formatted()}"


def main() -> str:
    c = Customer("Alice", "1 Main St", "Springfield")
    return c.label()
