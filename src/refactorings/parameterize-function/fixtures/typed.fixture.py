params = {"file": "fixture.py", "target": "compute_total", "paramName": "tax_rate", "paramType": "float"}

def compute_total(price: int, quantity: int) -> int:
    return price * quantity

def main():
    a = compute_total(10, 5)
    b = compute_total(20, 3)
    return f"{a},{b}"
