params = {"file": "fixture.py", "target": "Shape", "typeField": "shape_type"}


class Shape:
    def __init__(self, shape_type: str, size: int) -> None:
        self.shape_type: str = shape_type
        self.size: int = size

    def area(self) -> int:
        if self.shape_type == "circle":
            return self.size * self.size
        else:
            return self.size


def make_shape(shape_type: str, size: int) -> "Shape":
    return Shape(shape_type, size)


def describe(s: Shape) -> str:
    return f"type={s.shape_type}, area={s.area()}"


def main() -> str:
    s = make_shape("circle", 5)
    return describe(s)
