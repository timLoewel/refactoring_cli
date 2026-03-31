params = {"file": "model.py", "target": "Person", "delegate": "department"}
from model import Person

def main():
    p = Person("Dave", "Eve")
    return f"{p.name}'s manager is {p.department.get_manager()}"
