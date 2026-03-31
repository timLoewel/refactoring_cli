params = {"file": "fixture.py", "target": "Animal", "method": "fetch", "subclass": "Dog"}


class Animal:
    def __init__(self, name: str) -> None:
        self.name = name

    def fetch(self) -> str:
        return f"{self.name} fetches the ball!"


class Dog(Animal):
    def __init__(self, name: str) -> None:
        super().__init__(name)

    def speak(self) -> str:
        return "Woof!"


class Cat(Animal):
    def __init__(self, name: str) -> None:
        super().__init__(name)


def main() -> str:
    d = Dog("Rex")
    return d.fetch()
