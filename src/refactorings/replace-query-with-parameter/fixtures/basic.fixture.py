params = {"file": "fixture.py", "target": "calculate_price", "query": "get_tax_rate()", "paramName": "tax_rate"}

TAX_RATE = 0.1

def get_tax_rate():
    return TAX_RATE

def calculate_price(base_price):
    tax = get_tax_rate()
    return base_price + base_price * tax

def main():
    a = calculate_price(100)
    b = calculate_price(200)
    return f"{a} {b}"
