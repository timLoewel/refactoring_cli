params = {"file": "fixture.py", "startLine": 11, "endLine": 12, "name": "compute_total"}


def process_order(quantity: int, price: float) -> str:
    """Process an order and return a formatted receipt.

    Args:
        quantity: Number of items.
        price: Price per item.
    """
    subtotal = quantity * price
    tax = subtotal * 0.1
    return f"Total: {subtotal + tax:.2f}"


def main() -> str:
    return process_order(3, 10.0)
