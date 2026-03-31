params = {"file": "fixture.py", "target": "read_config"}

import os

def read_config(path, default_value):
    if not os.path.exists(path):
        return default_value
    else:
        with open(path) as f:
            data = f.read()
            if not data.strip():
                return default_value
            else:
                return data.strip()

def main():
    # Write a temp file to test
    import tempfile
    with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
        f.write("  hello  ")
        tmp = f.name
    try:
        result = read_config(tmp, "fallback")
    finally:
        os.unlink(tmp)
    return str(result)
