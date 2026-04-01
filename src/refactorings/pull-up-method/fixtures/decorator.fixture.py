params = {"file": "fixture.py", "target": "Dog", "method": "create"}


class Animal:
    def __init__(self, name: str) -> None:
        self.name = name


class Dog(Animal):
    def __init__(self, name: str) -> None:
        super().__init__(name)

    @staticmethod
    def create(name: str) -> "Dog":
        return Dog(name)

    def speak(self) -> str:
        return f"{self.name}: Woof!"


def main() -> str:
    d = Dog.create("Rex")
    return d.speak()
