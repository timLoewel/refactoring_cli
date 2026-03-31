params = {"file": "fixture.py", "target": "add_defaults"}

def add_defaults(config):
    config.setdefault("timeout", 30)
    config.setdefault("retries", 3)

def main():
    cfg = {"timeout": 60}
    add_defaults(cfg)
    return f"{cfg['timeout']},{cfg['retries']}"
