params = {"file": "fixture.py", "target": "compute_discount", "condition": "price >= 0 and percent >= 0"}

def compute_discount(price, percent):
    return price * (percent / 100)

def main():
    result1 = compute_discount(200, 15)
    result2 = compute_discount(100, 0)
    return f"{result1},{result2}"
