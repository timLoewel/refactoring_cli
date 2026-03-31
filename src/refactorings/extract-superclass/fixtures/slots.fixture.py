params = {"file": "fixture.py", "target": "Dog", "superclassName": "Animal", "methods": "get_name", "slots": "name"}


class Dog:
    __slots__ = ("name", "breed")

    def __init__(self, name: str, breed: str) -> None:
        self.name = name
        self.breed = breed

    def get_name(self) -> str:
        return self.name

    def get_breed(self) -> str:
        return self.breed


def main() -> str:
    d = Dog("Rex", "Labrador")
    return d.get_name() + " | " + d.get_breed()
