params = {"file": "orders.py", "target": "RushOrder", "delegateClassName": "RushBehavior"}
from orders import RushOrder


def main() -> str:
    o = RushOrder()
    return f"fee={o.rush_fee()}"
