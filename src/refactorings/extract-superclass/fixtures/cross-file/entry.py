params = {"file": "employee.py", "target": "Employee", "superclassName": "Person", "methods": "get_name,greet", "outFile": "person.py"}
from employee import Employee


def main():
    e = Employee("Alice", 42)
    return e.get_name() + " | " + e.greet()
