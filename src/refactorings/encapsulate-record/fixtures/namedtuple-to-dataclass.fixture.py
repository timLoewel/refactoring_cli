params = {"file": "fixture.py", "target": "Color", "className": "Color"}

from typing import NamedTuple

class Color(NamedTuple):
    red: int
    green: int
    blue: int

def to_hex(c: "Color") -> str:
    return f"#{c.red:02x}{c.green:02x}{c.blue:02x}"

def main():
    c = Color(red=255, green=128, blue=0)
    return to_hex(c)
