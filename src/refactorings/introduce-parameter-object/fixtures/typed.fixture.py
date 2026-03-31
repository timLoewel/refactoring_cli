params = {"file": "fixture.py", "target": "create_user", "params": "name,age,email", "objectName": "user_data", "className": "UserData"}

def create_user(name: str, age: int, email: str) -> str:
    return f"{name} ({age}) - {email}"

def main():
    result = create_user("Alice", 30, "alice@example.com")
    return result
