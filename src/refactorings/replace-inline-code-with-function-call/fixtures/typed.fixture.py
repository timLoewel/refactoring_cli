params = {"file": "fixture.py", "target": "x * x", "name": "square"}

x: int = 7


def square() -> int:
    return x ** 2


def main() -> str:
    a: int = x * x
    b: int = x * x + 1
    return f"{a},{b}"
