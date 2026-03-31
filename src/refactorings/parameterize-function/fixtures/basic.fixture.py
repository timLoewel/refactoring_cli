params = {"file": "fixture.py", "target": "format_label", "paramName": "prefix", "paramType": "str"}

def format_label(value):
    return f"Value: {value}"

def main():
    a = format_label(42)
    b = format_label(100)
    return f"{a} | {b}"
