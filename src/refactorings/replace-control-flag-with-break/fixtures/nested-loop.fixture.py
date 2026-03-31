params = {"file": "fixture.py", "target": "done"}

def find_in_matrix(matrix, target):
    done = False
    result = (-1, -1)
    for i, row in enumerate(matrix):
        for j, val in enumerate(row):
            if val == target:
                result = (i, j)
                done = True
        if done:
            break
    return result

def main():
    matrix = [[1, 2], [3, 4], [5, 6]]
    result = find_in_matrix(matrix, 4)
    return str(result)
