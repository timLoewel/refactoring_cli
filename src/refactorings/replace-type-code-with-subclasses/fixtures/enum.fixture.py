params = {"file": "fixture.py", "target": "Vehicle", "typeField": "vehicle_type"}

from enum import Enum


class VehicleType(Enum):
    CAR = "car"
    TRUCK = "truck"


class Vehicle:
    def __init__(self, name: str, vehicle_type: VehicleType) -> None:
        self.name = name
        self.vehicle_type = vehicle_type

    def max_speed(self) -> int:
        if self.vehicle_type == VehicleType.CAR:
            return 200
        else:
            return 120


def main() -> str:
    v = Vehicle("Tesla", VehicleType.CAR)
    return f"speed={v.max_speed()}"
