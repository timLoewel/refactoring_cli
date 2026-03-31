params = {"file": "model.py", "target": "Order", "typeField": "order_type"}

from model import Order


def main() -> str:
    o = Order(50, "rush")
    return f"charge={o.charge()}"
