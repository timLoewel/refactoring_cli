params = {"file": "fixture.py", "target": "parse_age"}

def parse_age(text: str) -> int:
    try:
        val = int(text)
    except Exception:
        return -1
    if val < 0:
        return -1
    return val

def main():
    try:
        r1 = parse_age("25")
        return f"ok:{r1}"
    except ValueError:
        return "error"
