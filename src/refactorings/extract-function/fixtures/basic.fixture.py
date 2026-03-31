params = {"file": "fixture.py", "startLine": 5, "endLine": 6, "name": "calculate_total"}

def main():
    price = 100
    tax = price * 0.1
    total = price + tax
    return str(total)
