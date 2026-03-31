params = {"file": "fixture.py", "target": "lookup_user"}

def lookup_user(users, name):
    for user in users:
        if user["name"] == name:
            return user
    return None

def main():
    users = [{"name": "Alice", "age": 30}, {"name": "Bob", "age": 25}]
    try:
        user = lookup_user(users, "Alice")
        return f"found:{user['name']},{user['age']}"
    except LookupError:
        return "error:not_found"
