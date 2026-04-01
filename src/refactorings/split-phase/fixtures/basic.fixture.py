params = {
    "file": "fixture.py",
    "target": "process_order",
    "firstPhaseName": "validate_order",
    "secondPhaseName": "finalize_order",
}


def process_order(order: dict) -> None:
    assert order["quantity"] > 0
    assert order["price"] > 0
    order["total"] = order["quantity"] * order["price"]
    order["status"] = "confirmed"


def main() -> str:
    order = {"quantity": 3, "price": 10.0}
    process_order(order)
    return f"total={order['total']} status={order['status']}"
