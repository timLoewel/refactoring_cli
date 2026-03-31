params = {"file": "fixture.py", "target": "configure", "param_name": "val", "new_param_name": "value"}

def configure(*, val, timeout=30):
    return f"{val}-{timeout}"

def main():
    result = configure(val="test", timeout=60)
    return result
