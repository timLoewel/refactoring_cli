params = {"file": "fixture.py", "target": "Dog", "field": "sound"}


class Animal:
    def __init__(self, name: str) -> None:
        self.name = name


class Dog(Animal):
    sound = "Woof"
    __tag = "canine"

    def __init__(self, name: str) -> None:
        super().__init__(name)

    def describe(self) -> str:
        return f"{self.name}: {self.sound} ({Dog.__tag})"


def main() -> str:
    d = Dog("Rex")
    return d.describe()
