params = {"file": "fixture.py", "target": "Calculator"}

class Calculator:
    def __init__(self, a: int, b: int):
        self.a = a
        self.b = b

    def execute(self) -> int:
        return self.a + self.b

def main():
    result = Calculator(3, 4).execute()
    return str(result)
