params = {"file": "fixture.py", "target": "name", "className": "Person"}

class Person:
    def __init__(self, name):
        self.name = name

    def greet(self):
        return f"Hello, {self.name}"

def main():
    p = Person("Alice")
    greeting = p.greet()
    p.name = "Bob"
    greeting2 = p.greet()
    return f"{greeting},{greeting2}"
