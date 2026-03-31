params = {"file": "fixture.py", "target": "ServerConfig", "className": "ServerConfig"}

from typing import TypedDict

class ServerConfig(TypedDict):
    host: str
    port: int
    debug: bool

def create_config() -> "ServerConfig":
    return ServerConfig(host="localhost", port=8080, debug=False)

def get_url(cfg: "ServerConfig") -> str:
    return f"http://{cfg['host']}:{cfg['port']}"

def main():
    cfg = create_config()
    return get_url(cfg)
