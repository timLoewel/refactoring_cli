params = {"file": "fixture.py", "target": "base_price", "name": "get_base_price"}

def calculate_total(quantity, item_price):
    base_price = quantity * item_price
    discount = base_price * 0.1 if base_price > 100 else 0
    return base_price - discount

def main():
    result = calculate_total(5, 30)
    return str(result)
