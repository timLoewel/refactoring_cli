params = {"file": "fixture.py", "target": "greet", "flag": "formal"}

def greet(name, formal=False):
    if formal:
        return f"Good day, {name}."
    return f"Hey, {name}!"

def main():
    a = greet("Alice", formal=True)
    b = greet("Bob")
    return f"{a} {b}"
