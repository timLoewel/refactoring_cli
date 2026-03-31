params = {"file": "fixture.py", "target": "log_event", "param_name": "msg", "new_param_name": "message"}

def log_event(msg, *args, **kwargs):
    parts = [msg] + list(args)
    for k, v in kwargs.items():
        parts.append(f"{k}={v}")
    return ", ".join(str(p) for p in parts)

def main():
    result = log_event("start", 1, 2, level="info")
    return result
