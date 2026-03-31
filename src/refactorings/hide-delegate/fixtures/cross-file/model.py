class Department:
    def __init__(self, manager):
        self.manager = manager

    def get_manager(self):
        return self.manager

class Person:
    def __init__(self, name, manager):
        self.name = name
        self.department = Department(manager)
