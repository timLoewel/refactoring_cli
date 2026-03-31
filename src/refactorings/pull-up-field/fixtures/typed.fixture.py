params = {"file": "fixture.py", "target": "Circle", "field": "pi"}


class Shape:
    def __init__(self) -> None:
        pass


class Circle(Shape):
    pi: float = 3.14159

    def area(self, r: float) -> float:
        return self.pi * r * r


def main() -> str:
    c = Circle()
    return str(round(c.area(2.0), 4))
