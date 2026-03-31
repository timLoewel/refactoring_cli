params = {"file": "fixture.py", "target": "convert", "param_name": "val", "new_param_name": "value"}

from typing import overload

@overload
def convert(val: int) -> str: ...
@overload
def convert(val: str) -> int: ...

def convert(val):
    if isinstance(val, int):
        return str(val)
    return len(val)

def main():
    a = convert(val=42)
    b = convert(val="hello")
    return f"{a}-{b}"
