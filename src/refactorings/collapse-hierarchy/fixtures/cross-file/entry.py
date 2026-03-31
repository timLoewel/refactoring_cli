params = {"file": "shapes.py", "target": "Square"}
from shapes import Rectangle


def main() -> str:
    r = Rectangle(4, 4)
    return f"area={r.area()}"
