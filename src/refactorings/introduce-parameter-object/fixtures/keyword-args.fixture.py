params = {"file": "fixture.py", "target": "draw_point", "params": "x,y", "objectName": "point", "className": "Point"}

def draw_point(x, y):
    return f"({x}, {y})"

def main():
    a = draw_point(x=3, y=4)
    b = draw_point(x=0, y=0)
    return f"{a} | {b}"
