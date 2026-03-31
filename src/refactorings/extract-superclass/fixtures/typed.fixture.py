params = {"file": "fixture.py", "target": "Employee", "superclassName": "Person", "methods": "get_name,greet"}


class Employee:
    def __init__(self, name: str, employee_id: int) -> None:
        self.name = name
        self.employee_id = employee_id

    def get_name(self) -> str:
        return self.name

    def greet(self) -> str:
        return f"Hello, I'm {self.name}"

    def get_id(self) -> int:
        return self.employee_id


def main() -> str:
    e = Employee("Alice", 42)
    return e.get_name() + " | " + e.greet()
