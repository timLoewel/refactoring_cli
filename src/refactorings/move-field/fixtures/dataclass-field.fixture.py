params = {"file": "fixture.py", "target": "Product", "field": "tax_rate", "destination": "Category", "via": "category"}
from dataclasses import dataclass

@dataclass
class Category:
    label: str

@dataclass
class Product:
    name: str
    price: float
    category: Category
    tax_rate: float = 0.1

    def total_price(self) -> float:
        return self.price * (1 + self.tax_rate)

def main():
    cat = Category("electronics")
    p = Product("Widget", 50.0, cat)
    result = f"total={p.total_price()}"
    return result
