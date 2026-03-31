params = {"file": "fixture.py", "target": "Order", "specialValue": "None", "specialClassName": "NullOrder"}

class Order:
    def __init__(self, order_id):
        self.order_id = order_id

    def get_id(self):
        return self.order_id

    def get_total(self):
        return 100

def main():
    o = Order(42)
    if o is None:
        return "no order found"
    return f"order {o.get_id()}: ${o.get_total()}"
