params = {"file": "fixture.py", "target": "format_value", "flag": "uppercase"}

def format_value(value: str, uppercase: bool) -> str:
    if uppercase:
        return value.upper()
    return value.lower()

def main():
    a = format_value("Hello", True)
    b = format_value("World", False)
    return f"{a} {b}"
