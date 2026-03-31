params = {"file": "fixture.py", "target": "format_value", "param": "precision", "query": "get_precision()"}

def get_precision() -> int:
    return 2

def format_value(value: float, precision: int) -> str:
    return f"{value:.{precision}f}"

def main():
    a = format_value(3.14159, get_precision())
    b = format_value(2.71828, get_precision())
    return f"{a} {b}"
