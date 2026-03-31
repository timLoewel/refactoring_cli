params = {"file": "fixture.py", "target": "Stats", "into": "Player"}

class Stats:
    def __init__(self, score, level):
        self.score = score
        self.level = level
        self.rank = self._compute_rank()

    def _compute_rank(self):
        if self.score > 100:
            return "gold"
        return "silver"

    def summary(self):
        return f"L{self.level} {self.rank} ({self.score}pts)"

class Player:
    def __init__(self, name, score, level):
        self.name = name
        self.active = True
        self._stats = Stats(score, level)

    def display(self):
        status = "active" if self.active else "inactive"
        return f"{self.name} [{status}]: {self._stats.summary()}"

def main():
    p = Player("Alice", 150, 5)
    return p.display()
