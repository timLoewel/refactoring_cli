from config import debug_mode

params = {"file": "config.py", "target": "debug_mode"}

def main():
    if debug_mode:
        return "debug"
    return "release"
