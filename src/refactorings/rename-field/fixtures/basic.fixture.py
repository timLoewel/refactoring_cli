params = {"file": "fixture.py", "target": "Point", "field": "x_coord", "newName": "horizontal"}

class Point:
    def __init__(self, x, y):
        self.x_coord = x
        self.y_coord = y

    def magnitude(self):
        return (self.x_coord ** 2 + self.y_coord ** 2) ** 0.5

def main():
    p = Point(3, 4)
    val = p.x_coord + p.y_coord
    return str(val) + "," + str(p.magnitude())
