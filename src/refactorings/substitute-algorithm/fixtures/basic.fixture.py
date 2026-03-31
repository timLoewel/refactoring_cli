params = {"file": "fixture.py", "target": "found_person", "newBody": "    for p in people:\n        if p in ['Don', 'John', 'Kent']:\n            return p\n    return ''"}

def found_person(people):
    for i in range(len(people)):
        if people[i] == "Don":
            return "Don"
        if people[i] == "John":
            return "John"
        if people[i] == "Kent":
            return "Kent"
    return ""

def main():
    result1 = found_person(["Alice", "Don", "Bob"])
    result2 = found_person(["Alice", "Bob"])
    result3 = found_person(["Kent"])
    return f"{result1},{result2},{result3}"
