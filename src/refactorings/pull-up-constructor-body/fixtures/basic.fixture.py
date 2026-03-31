params = {"file": "fixture.py", "target": "Dog"}


class Animal:
    pass


class Dog(Animal):
    def __init__(self, name):
        super().__init__()
        self.name = name


def main():
    d = Dog("Rex")
    return d.name
