params = {"file": "fixture.py", "target": "Employee", "typeField": "type"}


class Employee:
    def __init__(self, name: str, type: str) -> None:
        self.name = name
        self.type = type

    def pay_amount(self) -> int:
        if self.type == "engineer":
            return 100
        elif self.type == "salesman":
            return 80
        else:
            return 60


def main() -> str:
    e = Employee("Alice", "engineer")
    return f"pay={e.pay_amount()}"
