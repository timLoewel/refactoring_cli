params = {"file": "fixture.py", "target": "process_value", "condition": "value > 0"}

def process_value(value):
    try:
        result = 100 / value
        return f"result:{result:.1f}"
    except ZeroDivisionError:
        return "error:zero"

def main():
    return f"{process_value(5)},{process_value(0)}"
