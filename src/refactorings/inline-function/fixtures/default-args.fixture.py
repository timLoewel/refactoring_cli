params = {"file": "fixture.py", "target": "greet"}

def greet(name, greeting="Hello"):
    return greeting + ", " + name + "!"

def main():
    result = greet("World")
    return result
