params = {"file": "fixture.py", "target": "Counter", "field": "value"}


class Counter:
    def __init__(self, initial: int) -> None:
        self._value = initial

    @property
    def value(self) -> int:
        return self._value

    @value.setter
    def value(self, v: int) -> None:
        self._value = v


def main() -> str:
    c = Counter(5)
    return f"count: {c.value}"
