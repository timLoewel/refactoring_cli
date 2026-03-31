def calculate_tax(price, rate):
    return round(price * rate, 2)


def apply_discount(price, discount):
    return round(price * (1 - discount), 2)
