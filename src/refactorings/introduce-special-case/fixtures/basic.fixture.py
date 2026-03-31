params = {"file": "fixture.py", "target": "Customer", "specialValue": "unknown", "specialClassName": "UnknownCustomer"}

class Customer:
    def __init__(self, name):
        self.name = name

    def get_name(self):
        return self.name

    def get_discount(self):
        return 0

def main():
    c = Customer("Alice")
    if c.get_name() == "unknown":
        return "no discount for unknown customers"
    return f"discount: {c.get_discount()}"
