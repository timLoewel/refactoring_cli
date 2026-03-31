params = {"file": "fixture.py", "target": "Shape", "method": "describe", "subclass": "Circle"}

from typing import Optional


class Shape:
    def __init__(self, color: str) -> None:
        self.color = color

    def describe(self, prefix: Optional[str] = None) -> str:
        label = f"{prefix} " if prefix else ""
        return f"{label}{self.color} shape"


class Circle(Shape):
    def __init__(self, color: str, radius: float) -> None:
        super().__init__(color)
        self.radius = radius


def main() -> str:
    c = Circle("red", 5.0)
    return c.describe(prefix="Beautiful")
