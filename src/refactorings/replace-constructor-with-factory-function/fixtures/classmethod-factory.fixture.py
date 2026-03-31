params = {"file": "fixture.py", "target": "Connection", "factoryName": "create", "style": "classmethod"}

class Connection:
    def __init__(self, host: str, port: int) -> None:
        self.host = host
        self.port = port

    def address(self) -> str:
        return f"{self.host}:{self.port}"

def main():
    conn = Connection("localhost", 8080)
    return conn.address()
