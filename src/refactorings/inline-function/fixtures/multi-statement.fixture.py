params = {"file": "fixture.py", "target": "compute"}

def compute(x, y):
    total = x + y
    doubled = total * 2
    return doubled

def main():
    result = compute(3, 4)
    return str(result)
