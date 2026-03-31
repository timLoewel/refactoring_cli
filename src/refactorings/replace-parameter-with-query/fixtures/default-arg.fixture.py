params = {"file": "fixture.py", "target": "greet", "param": "greeting", "query": "get_greeting()"}

def get_greeting():
    return "Hello"

def greet(name, greeting="Hello"):
    return f"{greeting}, {name}!"

def main():
    a = greet("Alice")
    b = greet("Bob", "Hello")
    c = greet("Charlie", get_greeting())
    return f"{a} | {b} | {c}"
