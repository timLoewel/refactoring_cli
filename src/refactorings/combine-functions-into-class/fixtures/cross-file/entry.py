params = {"file": "services.py", "target": "calculate_tax,apply_discount", "className": "PriceCalculator"}
from services import calculate_tax, apply_discount


def main():
    tax = calculate_tax(100.0, 0.15)
    discounted = apply_discount(100.0, 0.1)
    return f"tax={tax}, discounted={discounted}"
