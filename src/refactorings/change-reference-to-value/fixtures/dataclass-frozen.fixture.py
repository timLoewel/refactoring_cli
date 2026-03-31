params = {"file": "fixture.py", "target": "Point"}

from dataclasses import dataclass


@dataclass
class Point:
    x: float
    y: float


def main() -> str:
    p = Point(1.0, 2.0)
    return f"{p.x} {p.y}"
