
import csv
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
INPUT = BASE / "data" / "recycling_points.csv"
OUTPUT = BASE / "supabase" / "seed.sql"


def sql_value(value):
    if value is None or value == "":
        return "NULL"

    return "'" + str(value).replace("'", "''") + "'"


with INPUT.open(encoding="utf-8", newline="") as file:
    rows = list(csv.DictReader(file))

columns = [
    "name",
    "address",
    "latitude",
    "longitude",
    "operating_hours",
    "status",
    "source",
]

with OUTPUT.open("w", encoding="utf-8") as file:
    file.write("-- RecycleSG local recycling point seed data\n")
    file.write("-- Generated from NEA Recycling Bins dataset\n\n")

    for start in range(0, len(rows), 500):
        batch = rows[start:start + 500]

        file.write(
            "INSERT INTO public.recycling_points "
            "(" + ", ".join(columns) + ")\nVALUES\n"
        )

        values = []
        for row in batch:
            fields = [
                sql_value(row[column]) for column in columns
            ]
            values.append("(" + ", ".join(fields) + ")")

        file.write(",\n".join(values) + ";\n\n")

print("Records processed:", len(rows))
print("SQL file generated:", OUTPUT)
print("File size (MB):", round(
    OUTPUT.stat().st_size / (1024 * 1024), 2
))
