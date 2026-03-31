from models import Employee, Department

params = {"file": "models.py", "target": "Employee", "field": "office", "destination": "Department", "via": "dept"}

def main():
    d = Department("Engineering")
    e = Employee("Alice", d)
    result = f"info={e.info()}"
    return result
