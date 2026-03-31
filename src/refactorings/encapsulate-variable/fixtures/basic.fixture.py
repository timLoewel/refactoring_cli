params = {"file": "fixture.py", "target": "tax_rate"}

tax_rate = 0.1

def calculate_tax(amount):
    return amount * tax_rate

def main():
    return str(calculate_tax(100))
