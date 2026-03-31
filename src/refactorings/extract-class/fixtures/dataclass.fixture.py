params = {"file": "fixture.py", "target": "Product", "fields": "weight,length", "newClassName": "Dimensions"}
from dataclasses import dataclass

@dataclass
class Product:
    name: str
    price: float
    weight: float
    length: float

    def shipping_label(self) -> str:
        return f"{self.name}: {self.weight}kg, {self.length}cm"

def main():
    p = Product(name="Laptop", price=999.99, weight=2.5, length=35.0)
    return p.shipping_label()
