params = {"file": "fixture.py", "target": "Employee", "superclassName": "Person", "methods": "get_name,greet"}


class Employee:
    def __init__(self, name, employee_id):
        self.name = name
        self.employee_id = employee_id

    def get_name(self):
        return self.name

    def greet(self):
        return f"Hello, I'm {self.name}"

    def get_id(self):
        return self.employee_id


def main():
    e = Employee("Alice", 42)
    return e.get_name() + " | " + e.greet()
