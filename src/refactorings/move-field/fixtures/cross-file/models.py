class Department:
    def __init__(self, name):
        self.name = name

class Employee:
    def __init__(self, name, dept):
        self.name = name
        self.dept = dept
        self.office = "Building A"

    def info(self):
        return f"{self.name} in {self.office}"
