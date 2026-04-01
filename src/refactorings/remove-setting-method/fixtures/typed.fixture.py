params = {"file": "fixture.py", "target": "Temperature", "field": "celsius"}


class Temperature:
    def __init__(self, celsius: float) -> None:
        self._celsius: float = celsius

    @property
    def celsius(self) -> float:
        return self._celsius

    @celsius.setter
    def celsius(self, value: float) -> None:
        self._celsius = value

    @property
    def fahrenheit(self) -> float:
        return self._celsius * 9 / 5 + 32


def main() -> str:
    t = Temperature(100.0)
    return f"{t.celsius}°C = {t.fahrenheit}°F"
