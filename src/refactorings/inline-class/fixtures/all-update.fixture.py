params = {"file": "fixture.py", "target": "Logger", "into": "App"}

__all__ = ["Logger", "App"]

class Logger:
    def __init__(self, prefix):
        self.prefix = prefix

    def log(self, msg):
        return f"[{self.prefix}] {msg}"

class App:
    def __init__(self, name):
        self.name = name
        self._logger = Logger(name)

    def run(self, action):
        return self._logger.log(f"{action} executed")

def main():
    app = App("myapp")
    return app.run("deploy")
