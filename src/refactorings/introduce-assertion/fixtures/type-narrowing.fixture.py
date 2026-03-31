params = {"file": "fixture.py", "target": "process_value", "condition": "isinstance(value, int)", "message": "value must be an integer"}

def process_value(value):
    return value * 2 + 1

def main():
    result1 = process_value(5)
    result2 = process_value(10)
    return f"{result1},{result2}"
