params = {"file": "fixture.py", "target": "Dog", "field": "sound"}


class Animal:
    def __init__(self, name: str) -> None:
        self.name = name


class Dog(Animal):
    sound = "Woof"

    def __init__(self, name: str) -> None:
        super().__init__(name)

    def speak(self) -> str:
        return f"{self.name}: {self.sound}"


def main() -> str:
    d = Dog("Rex")
    return d.speak()
