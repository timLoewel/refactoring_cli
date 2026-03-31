params = {"file": "fixture.py", "target": "AdminUser"}


class User:
    def __init__(self, name: str) -> None:
        self.name = name


class AdminUser(User):
    def can_delete(self) -> bool:
        return True


def main() -> str:
    u = AdminUser("alice")
    is_admin = isinstance(u, AdminUser)
    return f"is_admin={is_admin}, can_delete={u.can_delete()}"
