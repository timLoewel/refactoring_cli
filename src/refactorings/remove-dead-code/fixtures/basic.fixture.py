params = {"file": "fixture.py", "target": "unused_func"}

def main():
    x = 42
    return str(x)

def unused_func():
    return "never called"
