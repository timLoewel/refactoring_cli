params = {"file": "fixture.py", "target": "Point", "field": "label", "destination": "PointMeta", "via": "meta"}

class PointMeta:
    __slots__ = ("color",)

    def __init__(self, color):
        self.color = color

class Point:
    __slots__ = ("x", "y", "label", "meta")

    def __init__(self, x, y, meta):
        self.x = x
        self.y = y
        self.label = "default"
        self.meta = meta

    def describe(self):
        return f"{self.label}: ({self.x}, {self.y})"

def main():
    pm = PointMeta("red")
    p = Point(1, 2, pm)
    result = f"desc={p.describe()}"
    return result
