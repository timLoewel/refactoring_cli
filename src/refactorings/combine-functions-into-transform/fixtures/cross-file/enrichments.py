def enrich_discounted(order):
    result = {**order}
    result["discounted"] = round(result["price"] * (1 - result["discount"]), 2)
    return result


def enrich_tax(order):
    result = {**order}
    result["tax"] = round(result["price"] * result["tax_rate"], 2)
    return result
