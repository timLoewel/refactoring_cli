params = {"file": "fixture.py", "target": "Team", "field": "members"}

class Team:
    def __init__(self):
        self.members = []

    def count(self):
        return len(self.members)

def main():
    team = Team()
    team.members.append("Alice")
    team.members.append("Bob")
    result = f"count={team.count()}"
    team.members.remove("Alice")
    result += f",after_remove={team.count()}"
    items = list(team.members)
    result += f",members={','.join(items)}"
    return result
