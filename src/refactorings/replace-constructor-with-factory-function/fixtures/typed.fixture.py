params = {"file": "fixture.py", "target": "Point", "factoryName": "create_point"}

class Point:
    def __init__(self, x: float, y: float) -> None:
        self.x = x
        self.y = y

    def distance(self) -> float:
        return (self.x ** 2 + self.y ** 2) ** 0.5

def main():
    p = Point(3.0, 4.0)
    return str(p.distance())
