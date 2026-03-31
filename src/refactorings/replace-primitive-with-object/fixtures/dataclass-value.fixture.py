params = {"file": "fixture.py", "target": "price", "className": "Price", "style": "dataclass"}

price = 19.99

def apply_discount(p, pct):
    return p * (1 - pct / 100)

def main():
    discounted = apply_discount(price, 10)
    return f"original={price},discounted={discounted:.2f}"
