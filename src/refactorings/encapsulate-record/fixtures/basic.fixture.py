params = {"file": "fixture.py", "target": "config", "className": "Config"}

config = {"host": "localhost", "port": 8080, "debug": True}

def get_url():
    return f"http://{config['host']}:{config['port']}"

def is_debug():
    return config["debug"]

def main():
    return f"{get_url()} debug={is_debug()}"
