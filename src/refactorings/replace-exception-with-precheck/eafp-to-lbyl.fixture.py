params = {"file": "fixture.py", "target": "safe_divide", "condition": "b != 0"}

def safe_divide(a, b):
    try:
        return a / b
    except ZeroDivisionError:
        return None

def main():
    results = []
    results.append(str(safe_divide(10, 2)))
    results.append(str(safe_divide(10, 0)))
    return ",".join(results)
