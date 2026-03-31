params = {"file": "fixture.py", "target": "process", "param_name": "val", "new_param_name": "value"}

def process(val, /, extra=0):
    return val + extra

def main():
    result = process(10, extra=5)
    return str(result)
