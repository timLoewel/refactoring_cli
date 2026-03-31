params = {"file": "fixture.py", "target": "Circle", "method": "describe"}

from typing import Optional


class Shape:
    def __init__(self, color: str) -> None:
        self.color = color


class Circle(Shape):
    def __init__(self, color: str, radius: float) -> None:
        super().__init__(color)
        self.radius = radius

    def describe(self, prefix: Optional[str] = None) -> str:
        label = f"{prefix} " if prefix else ""
        return f"{label}{self.color} shape"


def main() -> str:
    c = Circle("red", 5.0)
    return c.describe(prefix="Beautiful")
