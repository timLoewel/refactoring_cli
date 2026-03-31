params = {"file": "fixture.py", "target": "value", "className": "Sensor"}

class Sensor:
    __slots__ = ("value", "unit")

    def __init__(self, value, unit):
        self.value = value
        self.unit = unit

    def reading(self):
        return f"{self.value} {self.unit}"

def main():
    s = Sensor(42, "C")
    result1 = s.reading()
    s.value = 100
    result2 = s.reading()
    return f"{result1},{result2}"
