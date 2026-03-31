params = {"file": "fixture.py", "target": "make_greeting", "className": "MakeGreeting"}

PREFIX = "Hello"
SUFFIX = "!"

def make_greeting(name):
    return f"{PREFIX}, {name}{SUFFIX}"

def main():
    result = make_greeting("Alice")
    return result
