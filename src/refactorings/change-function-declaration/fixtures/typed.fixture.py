params = {"file": "fixture.py", "target": "greet", "param_name": "msg", "new_param_name": "message"}

def greet(msg: str) -> str:
    return f"Hello, {msg}!"

def main():
    result = greet(msg="world")
    return result
