params = {"file": "fixture.py", "target": "value"}

def main():
    value: int = 42
    first = value * 2
    value: str = "hello"
    second = len(value)
    return str(first + second)
