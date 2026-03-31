params = {"file": "model.py", "target": "Customer", "specialValue": "unknown", "specialClassName": "UnknownCustomer"}
from model import Customer

def main():
    c = Customer("Alice")
    if c.get_name() == "unknown":
        return "no discount for unknown customers"
    return f"discount: {c.get_discount()}"
