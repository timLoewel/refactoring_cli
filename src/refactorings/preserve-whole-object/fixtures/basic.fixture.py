params = {"file": "fixture.py", "target": "format_person"}

class Person:
    def __init__(self, name, age):
        self.name = name
        self.age = age

def format_person(name, age):
    return f"{name} is {age} years old"

def main():
    person = Person("Alice", 30)
    label = format_person(person.name, person.age)
    return label
