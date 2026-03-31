params = {"file": "fixture.py", "target": "Order", "fields": "total,tax", "newClassName": "OrderTotal"}

__all__ = ["Order"]

class Order:
    def __init__(self, item, total, tax):
        self.item = item
        self.total = total
        self.tax = tax

    def receipt(self):
        return f"{self.item}: ${self.total} + ${self.tax} tax"

def main():
    o = Order("Widget", 100, 8)
    return o.receipt()
