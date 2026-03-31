params = {"file": "fixture.py", "target": "Logger", "method": "format_msg", "subclass": "FileLogger"}


class Logger:
    def __init__(self, prefix: str) -> None:
        self.prefix = prefix

    def format_msg(self, msg: str) -> str:
        return f"[{self.prefix}] {msg}"


class FileLogger(Logger):
    def __init__(self, prefix: str, path: str) -> None:
        super().__init__(prefix)
        self.path = path

    def log(self, msg: str) -> str:
        formatted = super().format_msg(msg)
        return f"FILE:{formatted}"


def main() -> str:
    fl = FileLogger("INFO", "/var/log/app.log")
    return fl.log("started")
