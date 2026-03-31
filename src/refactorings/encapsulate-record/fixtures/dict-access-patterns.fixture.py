params = {"file": "fixture.py", "target": "settings", "className": "Settings"}

settings = {"name": "app", "version": "1.0", "retries": 3}

def get_name():
    return settings["name"]

def get_version_or_default():
    return settings.get("version")

def get_retries():
    return settings.get("retries")

def main():
    return f"{get_name()} v{get_version_or_default()} retries={get_retries()}"
