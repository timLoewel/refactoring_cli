params = {"file": "fixture.py", "target": "full_name"}


class Person:
    first: str
    last: str

    def __init__(self, first: str, last: str) -> None:
        self.first = first
        self.last = last
        self.full_name: str = f"{self.first} {self.last}"


def main() -> str:
    p = Person("Ada", "Lovelace")
    return p.full_name
