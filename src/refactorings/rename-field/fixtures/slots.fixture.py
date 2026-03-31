params = {"file": "fixture.py", "target": "Compact", "field": "value", "newName": "data"}

class Compact:
    __slots__ = ("value", "label")

    def __init__(self, v, l):
        self.value = v
        self.label = l

    def describe(self):
        return f"{self.label}={self.value}"

def main():
    c = Compact(42, "answer")
    result = c.value
    return str(result) + "," + c.describe()
