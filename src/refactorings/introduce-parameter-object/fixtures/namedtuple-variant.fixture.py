params = {"file": "fixture.py", "target": "draw_point", "params": "x,y", "objectName": "point", "className": "Point", "style": "namedtuple"}

def draw_point(x, y):
    return f"({x}, {y})"

def main():
    a = draw_point(3, 4)
    b = draw_point(0, 0)
    return f"{a} | {b}"
