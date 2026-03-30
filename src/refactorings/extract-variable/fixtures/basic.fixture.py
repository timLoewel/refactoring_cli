params = {"file": "fixture.py", "target": "price * 0.1", "name": "tax_amount"}

def main():
    price = 100
    tax = price * 0.1
    total = price * 0.1 + price
    return str(total + tax)
