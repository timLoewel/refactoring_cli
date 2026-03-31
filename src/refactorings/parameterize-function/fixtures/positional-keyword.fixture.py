params = {"file": "fixture.py", "target": "greet", "paramName": "punctuation", "paramType": "str"}

def greet(name, /, greeting="Hello", *, loud=False):
    msg = f"{greeting}, {name}"
    if loud:
        msg = msg.upper()
    return msg

def main():
    a = greet("Alice")
    b = greet("Bob", greeting="Hi", loud=True)
    return f"{a} | {b}"
