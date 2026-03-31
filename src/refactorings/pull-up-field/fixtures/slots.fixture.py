params = {"file": "fixture.py", "target": "Dog", "field": "breed"}


class Animal:
    __slots__ = ("name",)

    def __init__(self, name: str) -> None:
        self.name = name


class Dog(Animal):
    __slots__ = ("breed",)

    def __init__(self, name: str, breed: str) -> None:
        super().__init__(name)
        self.breed = breed

    def info(self) -> str:
        return f"{self.name} ({self.breed})"


def main() -> str:
    d = Dog("Rex", "Labrador")
    return d.info()
