params = {"file": "fixture.py", "target": "apply_discount"}

def apply_discount(order):
    order["discount"] = 10

def main():
    my_order = {"items": ["apple", "banana"], "discount": 0}
    apply_discount(my_order)
    return str(my_order["discount"])
