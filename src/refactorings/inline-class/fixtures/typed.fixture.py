params = {"file": "fixture.py", "target": "Address", "into": "Customer"}

class Address:
    def __init__(self, street: str, city: str, zip_code: str) -> None:
        self.street: str = street
        self.city: str = city
        self.zip_code: str = zip_code

    def full_address(self) -> str:
        return f"{self.street}, {self.city} {self.zip_code}"

class Customer:
    def __init__(self, name: str, street: str, city: str, zip_code: str) -> None:
        self.name: str = name
        self._address: Address = Address(street, city, zip_code)

    def label(self) -> str:
        return f"{self.name} - {self._address.full_address()}"

def main():
    c = Customer("Bob", "123 Main St", "Springfield", "62701")
    return c.label()
