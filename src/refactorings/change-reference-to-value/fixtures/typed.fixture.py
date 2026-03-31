params = {"file": "fixture.py", "target": "Config"}

from dataclasses import dataclass


@dataclass
class Config:
    name: str
    tags: list[str]


def main() -> str:
    c = Config("web", ["dev", "prod"])
    return f"{c.name}: {len(c.tags)} tags"
