params = {"file": "fixture.py", "target": "Dimensions", "into": "Box"}

from dataclasses import dataclass

@dataclass
class Dimensions:
    width: int
    height: int

    def area(self):
        return self.width * self.height

class Box:
    def __init__(self, label, width, height):
        self.label = label
        self._dims = Dimensions(width, height)

    def describe(self):
        return f"{self.label}: {self._dims.area()} sq units"

def main():
    b = Box("Package", 10, 5)
    return b.describe()
