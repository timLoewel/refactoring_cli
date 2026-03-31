params = {"file": "fixture.py", "target": "calculate_price", "param": "tax_rate", "query": "get_tax_rate()"}

TAX_RATE = 0.1

def get_tax_rate():
    return TAX_RATE

def calculate_price(base_price, tax_rate):
    return base_price + base_price * tax_rate

def main():
    a = calculate_price(100, get_tax_rate())
    b = calculate_price(200, get_tax_rate())
    return f"{a} {b}"
