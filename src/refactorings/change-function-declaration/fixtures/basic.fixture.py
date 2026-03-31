params = {"file": "fixture.py", "target": "calculate", "param_name": "val", "new_param_name": "amount"}

def calculate(val):
    return val * 2

def main():
    result = calculate(val=10)
    return str(result)
