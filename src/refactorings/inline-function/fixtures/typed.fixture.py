params = {"file": "fixture.py", "target": "add"}

def add(a: int, b: int) -> int:
    return a + b

def main():
    result = add(3, 4)
    return str(result)
