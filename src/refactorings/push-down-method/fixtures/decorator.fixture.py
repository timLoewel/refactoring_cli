params = {"file": "fixture.py", "target": "Animal", "method": "create", "subclass": "Dog"}


class Animal:
    def __init__(self, name: str) -> None:
        self.name = name

    @classmethod
    def create(cls, name: str) -> "Animal":
        return cls(name)


class Dog(Animal):
    def __init__(self, name: str) -> None:
        super().__init__(name)

    def speak(self) -> str:
        return f"{self.name}: Woof!"


class Cat(Animal):
    def __init__(self, name: str) -> None:
        super().__init__(name)


def main() -> str:
    d = Dog.create("Rex")
    return d.speak()
