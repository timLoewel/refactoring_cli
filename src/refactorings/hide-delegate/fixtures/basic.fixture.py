params = {"file": "fixture.py", "target": "Person", "delegate": "department", "method": "get_manager"}

class Department:
    def __init__(self, manager):
        self.manager = manager

    def get_manager(self):
        return self.manager

class Person:
    def __init__(self, name, manager):
        self.name = name
        self.department = Department(manager)

def main():
    p = Person("Dave", "Eve")
    return f"{p.name}'s manager is {p.department.get_manager()}"
