params = {"file": "fixture.py", "target": "calculate_price", "condition_name": "is_summer"}

def main():
    month = 7
    quantity = 10
    if month >= 6 and month <= 8:
        price = quantity * 0.9
    else:
        price = quantity * 1.0
    return str(price)
