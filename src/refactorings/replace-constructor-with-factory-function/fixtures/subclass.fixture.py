params = {"file": "fixture.py", "target": "Dog", "factoryName": "create_dog"}

class Animal:
    def __init__(self, name: str) -> None:
        self.name = name

class Dog(Animal):
    def speak(self) -> str:
        return f"{self.name} says Woof!"

def main():
    dog = Dog("Rex")
    return dog.speak()
