params = {"file": "fixture.py", "target": "Shape", "field": "pi", "subclass": "Circle"}


class Shape:
    pi: float = 3.14159

    def __init__(self) -> None:
        pass


class Circle(Shape):
    def area(self, r: float) -> float:
        return self.pi * r * r


class Square(Shape):
    def area(self, s: float) -> float:
        return s * s


def main() -> str:
    c = Circle()
    return str(round(c.area(2.0), 4))
