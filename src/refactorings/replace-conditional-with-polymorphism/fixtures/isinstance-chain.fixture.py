params = {"file": "fixture.py", "target": "Animal", "method": "speak"}


class Animal:
    def __init__(self, name: str) -> None:
        self.name = name

    def speak(self) -> str:
        if isinstance(self, Dog):
            return f"{self.name} says Woof"
        elif isinstance(self, Cat):
            return f"{self.name} says Meow"
        else:
            return f"{self.name} is silent"


class Dog(Animal):
    pass


class Cat(Animal):
    pass


def main() -> str:
    d = Dog("Rex")
    return d.speak()
