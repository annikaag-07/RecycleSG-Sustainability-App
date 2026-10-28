
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


# Link every imported recycling point to the four
# materials accepted by the NEA general recycling bins.

with OUTPUT.open("a", encoding="utf-8") as file:
    file.write("\n-- Link recycling points to accepted materials\n")

    file.write("""
INSERT INTO public.recycling_point_materials (
    recycling_point_id,
    material_type_id
)
SELECT
    rp.id,
    mt.id
FROM public.recycling_points rp
CROSS JOIN public.material_types mt
WHERE rp.source = 'NEA Recycling Bins'
  AND mt.name IN ('Plastic', 'Paper', 'Glass', 'Metal')
ON CONFLICT DO NOTHING;
""")

print("Material association SQL added.")
