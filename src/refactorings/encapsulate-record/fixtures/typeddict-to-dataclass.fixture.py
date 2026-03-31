params = {"file": "fixture.py", "target": "Point", "className": "Point"}

from typing import TypedDict

class Point(TypedDict):
    x: float
    y: float

def distance(p: "Point") -> float:
    return (p["x"] ** 2 + p["y"] ** 2) ** 0.5

def main():
    p = Point(x=3.0, y=4.0)
    return str(distance(p))
