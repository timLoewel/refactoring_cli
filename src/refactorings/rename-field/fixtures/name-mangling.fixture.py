params = {"file": "fixture.py", "target": "Secret", "field": "__code", "newName": "__pin"}

class Secret:
    def __init__(self, val):
        self.__code = val

    def reveal(self):
        return self.__code

def main():
    s = Secret(42)
    direct = s.reveal()
    mangled = s._Secret__code
    return str(direct) + "," + str(mangled)
