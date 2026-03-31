params = {"file": "fixture.py", "target": "Animal", "field": "sound", "subclass": "Dog"}


class Animal:
    sound = "..."

    def __init__(self, name: str) -> None:
        self.name = name


class Dog(Animal):
    def __init__(self, name: str) -> None:
        super().__init__(name)

    def speak(self) -> str:
        return f"{self.name}: {self.sound}"


class Cat(Animal):
    def __init__(self, name: str) -> None:
        super().__init__(name)


def main() -> str:
    d = Dog("Rex")
    return d.speak()
