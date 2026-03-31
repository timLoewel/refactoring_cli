params = {"file": "fixture.py", "target": "calculate_tax,apply_discount", "className": "PriceCalculator"}


def calculate_tax(price: float, rate: float) -> float:
    return round(price * rate, 2)


def apply_discount(price: float, discount: float) -> float:
    return round(price * (1 - discount), 2)


def main():
    tax = calculate_tax(100.0, 0.15)
    discounted = apply_discount(100.0, 0.1)
    return f"tax={tax}, discounted={discounted}"
