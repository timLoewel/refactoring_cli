params = {"file": "fixture.py", "target": "Country"}


class Country:
    code: str
    name: str

    def __init__(self, code: str, name: str) -> None:
        self.code = code
        self.name = name


def main() -> str:
    c = Country("US", "United States")
    return f"{c.code}: {c.name}"
