params = {"file": "fixture.py", "target": "tax"}

def main():
    price = 100
    tax = price * 0.1
    total = price + tax
    return str(total)
