params = {
    "file": "fixture.py",
    "target": "process_report",
    "firstPhaseName": "collect_data",
    "secondPhaseName": "write_output",
}


def process_report(report: list) -> None:
    report.append("header")
    report.append("---")
    report.append("data row 1")
    report.append("footer")


def main() -> str:
    report: list = []
    process_report(report)
    return "\n".join(report)
