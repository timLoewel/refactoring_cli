params = {"file": "fixture.py", "target": "Dog"}


class Animal:
    def __init__(self, name, breed):
        self.name = name


class Dog(Animal):
    def __init__(self, name, breed):
        super().__init__(name, breed)
        self.breed = breed


def main():
    d = Dog("Rex", "Labrador")
    return f"{d.name} is a {d.breed}"
