params = {"file": "fixture.py", "target": "x * x", "name": "square"}

x = 7

def square():
    return x ** 2

def main():
    a = x * x
    b = x * x + 1
    return f"{a},{b}"
