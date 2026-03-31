params = {"file": "fixture.py", "target": "Dog", "superclassName": "Animal", "methods": "speak", "abstract": "true"}


class Dog:
    def __init__(self, name: str) -> None:
        self.name = name

    def speak(self) -> str:
        return f"{self.name} says: Woof!"

    def fetch(self) -> str:
        return f"{self.name} fetches the ball"


def main() -> str:
    d = Dog("Rex")
    return d.speak()
