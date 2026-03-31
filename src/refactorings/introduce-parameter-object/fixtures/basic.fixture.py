params = {"file": "fixture.py", "target": "create_user", "params": "name,age,email", "objectName": "user_data", "className": "UserData"}

def create_user(name, age, email):
    return f"{name} ({age}) - {email}"

def main():
    a = create_user("Alice", 30, "alice@example.com")
    b = create_user("Bob", 25, "bob@example.com")
    return f"{a} | {b}"
