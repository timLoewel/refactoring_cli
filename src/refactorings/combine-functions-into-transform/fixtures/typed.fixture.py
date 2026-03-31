params = {"file": "fixture.py", "functions": "enrich_discounted,enrich_tax", "name": "enrich_order"}

from typing import TypedDict


class OrderData(TypedDict, total=False):
    price: float
    discount: float
    tax_rate: float
    discounted: float
    tax: float


def enrich_discounted(order: OrderData) -> OrderData:
    result = dict(order)
    result["discounted"] = round(result["price"] * (1 - result["discount"]), 2)
    return result  # type: ignore


def enrich_tax(order: OrderData) -> OrderData:
    result = dict(order)
    result["tax"] = round(result["price"] * result["tax_rate"], 2)
    return result  # type: ignore


def main():
    order: OrderData = {"price": 100.0, "discount": 0.1, "tax_rate": 0.15}
    order = enrich_discounted(order)
    order = enrich_tax(order)
    return f"discounted={order['discounted']}, tax={order['tax']}"
