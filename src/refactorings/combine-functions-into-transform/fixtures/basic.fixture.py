params = {"file": "fixture.py", "functions": "enrich_discounted,enrich_tax", "name": "enrich_order"}


def enrich_discounted(order):
    result = {**order}
    result["discounted"] = round(result["price"] * (1 - result["discount"]), 2)
    return result


def enrich_tax(order):
    result = {**order}
    result["tax"] = round(result["price"] * result["tax_rate"], 2)
    return result


def main():
    order = {"price": 100.0, "discount": 0.1, "tax_rate": 0.15}
    order = enrich_discounted(order)
    order = enrich_tax(order)
    return f"discounted={order['discounted']}, tax={order['tax']}"
