params = {"file": "fixture.py", "target": "GuideDog", "superclassName": "Animal", "methods": "get_name"}


class Trainable:
    def train(self) -> str:
        return "training"


class GuideDog(Trainable):
    def __init__(self, name: str) -> None:
        self.name = name

    def get_name(self) -> str:
        return self.name

    def guide(self) -> str:
        return f"{self.name} guides"


def main() -> str:
    g = GuideDog("Buddy")
    return g.get_name() + " | " + g.guide() + " | " + g.train()
