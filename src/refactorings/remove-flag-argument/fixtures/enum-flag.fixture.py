params = {"file": "fixture.py", "target": "set_speed", "flag": "turbo"}

def set_speed(base, turbo):
    if turbo:
        return base * 2
    return base

def main():
    a = set_speed(10, True)
    b = set_speed(10, False)
    return f"{a} {b}"
