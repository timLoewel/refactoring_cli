params = {"file": "fixture.py", "target": "Cat"}


class Animal:
    def __init__(self, name: str) -> None:
        self.name = name

    def speak(self) -> str:
        return f"{self.name} makes a sound"


class Cat(Animal):
    pass


def describe(a: Cat) -> str:
    return a.speak()


def main() -> str:
    c: Cat = Cat("Whiskers")
    return describe(c)
