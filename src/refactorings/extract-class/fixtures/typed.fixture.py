params = {"file": "fixture.py", "target": "Employee", "fields": "salary,department", "newClassName": "Employment"}

class Employee:
    def __init__(self, name: str, salary: float, department: str) -> None:
        self.name: str = name
        self.salary: float = salary
        self.department: str = department

    def summary(self) -> str:
        return f"{self.name}: {self.department} (${self.salary})"

def main():
    e = Employee("Bob", 75000.0, "Engineering")
    return e.summary()
