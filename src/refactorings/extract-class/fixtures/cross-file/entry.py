params = {"file": "model.py", "target": "Person", "fields": "street,city", "newClassName": "Address"}
from model import Person

def main():
    p = Person("Alice", "123 Main St", "Springfield")
    return p.label()
