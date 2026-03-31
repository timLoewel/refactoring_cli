params = {"file": "model.py", "target": "Person", "delegate": "department", "method": "get_manager"}
from model import Person

def main():
    p = Person("Dave", "Eve")
    return f"{p.name}'s manager is {p.department.get_manager()}"
