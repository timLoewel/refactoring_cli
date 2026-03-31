params = {"file": "fixture.py", "target": "Shape", "method": "area"}


class Shape:
    def area(self) -> float:
        if isinstance(self, Circle):
            return 3.14 * self.radius * self.radius
        elif isinstance(self, Square):
            return float(self.side * self.side)
        else:
            return 0.0


class Circle(Shape):
    def __init__(self, radius: float) -> None:
        self.radius = radius


class Square(Shape):
    def __init__(self, side: float) -> None:
        self.side = side


def main() -> str:
    c = Circle(5.0)
    return f"area={c.area():.2f}"
