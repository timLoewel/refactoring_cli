params = {"file": "fixture.py", "target": "3.14159", "name": "PI"}

def main():
    radius = 5
    area = 3.14159 * radius * radius
    circumference = 2 * 3.14159 * radius
    return str(round(area + circumference, 2))
