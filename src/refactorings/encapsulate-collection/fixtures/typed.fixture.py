params = {"file": "fixture.py", "target": "Library", "field": "books"}

class Library:
    def __init__(self):
        self.books: list[str] = []

def main():
    lib = Library()
    lib.books.append("1984")
    lib.books.append("Dune")
    lib.books.remove("1984")
    items = list(lib.books)
    return f"books={','.join(items)}"
