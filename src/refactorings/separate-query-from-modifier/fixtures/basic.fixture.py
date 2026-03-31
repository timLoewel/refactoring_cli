params = {"file": "fixture.py", "target": "total_and_apply_discount"}

def total_and_apply_discount(order):
    order["discount"] = 10
    return order["price"] - order["discount"]

def main():
    my_order = {"price": 100, "discount": 0}
    total = total_and_apply_discount(my_order)
    return f"{total},{my_order['discount']}"
