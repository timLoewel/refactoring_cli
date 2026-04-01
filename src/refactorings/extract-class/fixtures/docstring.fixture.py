params = {"file": "fixture.py", "target": "Employee", "fields": "salary,level", "newClassName": "Compensation"}


class Employee:
    """Represents an employee in the system."""

    def __init__(self, name: str, salary: float, level: int) -> None:
        self.name = name
        self.salary = salary
        self.level = level

    def summary(self) -> str:
        return f"{self.name}: L{self.level} @ {self.salary}"


def main() -> str:
    e = Employee("Alice", 90000.0, 5)
    return e.summary()
