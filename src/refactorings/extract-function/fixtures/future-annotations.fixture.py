from __future__ import annotations

params = {"file": "fixture.py", "startLine": 7, "endLine": 8, "name": "build_greeting"}


def greet(name: str, title: str) -> str:
    prefix: str = title.upper()
    message: str = f"[{prefix}] Hello, {name}!"
    return message


def main() -> str:
    return greet("Ada", "Dr")
