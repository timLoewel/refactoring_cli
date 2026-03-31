params = {"file": "fixture.py", "target": "Circle", "field": "radius", "newName": "size"}

class Circle:
    def __init__(self, r):
        self._radius = r

    @property
    def radius(self):
        return self._radius

    @radius.setter
    def radius(self, value):
        if value < 0:
            raise ValueError("negative")
        self._radius = value

def main():
    c = Circle(5)
    val = c.radius
    c.radius = 10
    return str(val) + "," + str(c.radius)
