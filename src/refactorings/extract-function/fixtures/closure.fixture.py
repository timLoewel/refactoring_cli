params = {"file": "fixture.py", "startLine": 6, "endLine": 7, "name": "calculate_discount"}

def main():
    rate = 0.1
    price = 200
    discount = price * rate
    final_price = price - discount
    return str(final_price)
