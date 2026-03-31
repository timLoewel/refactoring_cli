params = {"file": "fixture.py", "target": "process", "query": "get_mode()", "paramName": "mode"}

CURRENT_MODE = "fast"

def get_mode():
    return CURRENT_MODE

def process(data, /, *, verbose=False):
    mode = get_mode()
    if verbose:
        print(f"Processing in {mode} mode")
    return f"{data}:{mode}"

def main():
    a = process("x", verbose=True)
    b = process("y")
    return f"{a} {b}"
