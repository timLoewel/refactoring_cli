params = {"file": "fixture.py", "target": "Dog", "method": "describe"}


class Animal:
    def __init__(self, name: str) -> None:
        self.name = name


class Dog(Animal):
    def __init__(self, name: str, breed: str) -> None:
        super().__init__(name)
        self.breed = breed

    def describe(self) -> str:
        """Return a description of this dog."""
        return f"{self.name} is a {self.breed}"


def main() -> str:
    d = Dog("Rex", "Labrador")
    return d.describe()
