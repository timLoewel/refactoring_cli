params = {"file": "fixture.py", "target": "Derived"}


class Base:
    def __init__(self, *args, **kwargs):
        self.args = args
        self.kwargs = kwargs


class Derived(Base):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.extra = "extra"


def main():
    d = Derived(1, 2, key="val")
    return f"{d.args} {d.kwargs} {d.extra}"
