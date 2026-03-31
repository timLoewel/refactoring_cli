params = {"file": "fixture.py", "target": "Order", "field": "discount", "destination": "Customer", "via": "customer"}

class Customer:
    def __init__(self, name):
        self.name = name

class Order:
    def __init__(self, customer, amount):
        self.customer = customer
        self.amount = amount
        self.discount = 0.1

    def total(self):
        return self.amount * (1 - self.discount)

def main():
    c = Customer("Alice")
    o = Order(c, 100)
    result = f"total={o.total()}"
    return result
