params = {"file": "fixture.py", "target": "Person", "field": "first_name", "newName": "given_name"}

from dataclasses import dataclass

@dataclass
class Person:
    first_name: str
    last_name: str
    age: int

def main():
    p = Person(first_name="Alice", last_name="Smith", age=30)
    greeting = f"Hello, {p.first_name} {p.last_name}!"
    return greeting + "," + str(p.age)
