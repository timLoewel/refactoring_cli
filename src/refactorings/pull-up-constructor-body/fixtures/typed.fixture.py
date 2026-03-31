params = {"file": "fixture.py", "target": "Employee"}


class Person:
    pass


class Employee(Person):
    def __init__(self, name: str, age: int) -> None:
        super().__init__()
        self.name = name
        self.age = age


def main():
    e = Employee("Alice", 30)
    return f"{e.name} is {e.age}"
