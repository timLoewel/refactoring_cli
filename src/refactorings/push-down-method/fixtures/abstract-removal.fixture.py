params = {"file": "fixture.py", "target": "Renderer", "method": "render", "subclass": "HtmlRenderer"}

from abc import abstractmethod


class Renderer:
    def __init__(self, template: str) -> None:
        self.template = template

    @abstractmethod
    def render(self, data: str) -> str:
        return f"<html>{data}</html>"


class HtmlRenderer(Renderer):
    def __init__(self, template: str) -> None:
        super().__init__(template)


class TextRenderer(Renderer):
    def __init__(self, template: str) -> None:
        super().__init__(template)

    def render(self, data: str) -> str:
        return f"[{data}]"


def main() -> str:
    r = HtmlRenderer("base")
    return r.render("hello")
