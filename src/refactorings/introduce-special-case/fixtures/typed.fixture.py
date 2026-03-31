params = {"file": "fixture.py", "target": "Product", "specialValue": "discontinued", "specialClassName": "DiscontinuedProduct"}

class Product:
    def __init__(self, name: str, price: float) -> None:
        self.name = name
        self.price = price

    def get_name(self) -> str:
        return self.name

    def get_price(self) -> float:
        return self.price

    def is_available(self) -> bool:
        return True

def main() -> str:
    p = Product("Widget", 9.99)
    if p.get_name() == "discontinued":
        return "product unavailable"
    return f"{p.get_name()}: ${p.get_price()}"
