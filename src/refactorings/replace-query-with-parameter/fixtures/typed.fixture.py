params = {"file": "fixture.py", "target": "format_greeting", "query": "get_locale()", "paramName": "locale"}

DEFAULT_LOCALE = "en"

def get_locale() -> str:
    return DEFAULT_LOCALE

def format_greeting(name: str) -> str:
    locale = get_locale()
    if locale == "es":
        return f"Hola, {name}!"
    return f"Hello, {name}!"

def main():
    a = format_greeting("Alice")
    b = format_greeting("Bob")
    return f"{a} {b}"
