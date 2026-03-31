params = {"file": "fixture.py", "target": "Formatter", "method": "format"}


class Formatter:
    def __init__(self, style: str, value: str) -> None:
        self.style = style
        self.value = value

    def format(self) -> str:
        handlers = {
            "upper": self.value.upper(),
            "lower": self.value.lower(),
        }
        return handlers.get(self.style, self.value)


def main() -> str:
    f = Formatter("upper", "hello")
    return f.format()
