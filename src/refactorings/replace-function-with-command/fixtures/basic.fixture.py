params = {"file": "fixture.py", "target": "calculate_score", "className": "CalculateScore"}

def calculate_score(base, multiplier):
    return base * multiplier

def main():
    result = calculate_score(10, 3)
    return str(result)
