params = {"file": "fixture.py", "target": "AdminUser"}


class User:
    def __init__(self, name: str) -> None:
        self.name = name

    def greet(self) -> str:
        return f"Hello, {self.name}"


class AdminUser(User):
    pass


def is_admin(u: User) -> bool:
    return isinstance(u, AdminUser)


def main() -> str:
    admin = AdminUser("Alice")
    return f"admin={is_admin(admin)}, greeting={admin.greet()}"
