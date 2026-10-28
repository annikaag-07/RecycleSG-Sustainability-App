
import json
import csv
from pathlib import Path
from html.parser import HTMLParser


class AttributeParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.fields = {}
        self.current_key = None
        self.in_th = False
        self.in_td = False

    def handle_starttag(self, tag, attrs):
        if tag == "th":
            self.in_th = True
        elif tag == "td":
            self.in_td = True

    def handle_endtag(self, tag):
        if tag == "th":
            self.in_th = False
        elif tag == "td":
            self.in_td = False
            self.current_key = None

    def handle_data(self, data):
        value = data.strip()

        if self.in_th and value:
            self.current_key = value
        elif self.in_td and self.current_key:
            self.fields[self.current_key] = (
                self.fields.get(self.current_key, "") + value
            )


BASE = Path(__file__).resolve().parent.parent
INPUT = BASE / "data" / "RecyclingBins.geojson"
OUTPUT = BASE / "data" / "recycling_points.csv"

with INPUT.open(encoding="utf-8") as file:
    geojson = json.load(file)

rows = []
invalid = 0
seen = set()

for feature in geojson["features"]:
    geometry = feature.get("geometry") or {}

    if geometry.get("type") != "Point":
        invalid += 1
        continue

    coordinates = geometry.get("coordinates") or []

    if len(coordinates) < 2:
        invalid += 1
        continue

    longitude, latitude = coordinates[:2]

    if not (1.1 <= latitude <= 1.5 and 103.5 <= longitude <= 104.1):
        invalid += 1
        continue

    properties = feature.get("properties") or {}

    parser = AttributeParser()
    parser.feed(properties.get("Description") or "")
    attributes = parser.fields

    block = attributes.get("ADDRESSBLOCKHOUSENUMBER", "").strip()
    street = attributes.get("ADDRESSSTREETNAME", "").strip()
    postal = attributes.get("ADDRESSPOSTALCODE", "").strip()
    building = attributes.get("ADDRESSBUILDINGNAME", "").strip()

    address = " ".join(part for part in [block, street] if part)

    if building:
        address = f"{address}, {building}" if address else building

    if postal:
        address = f"{address}, Singapore {postal}" if address else f"Singapore {postal}"

    if not address:
        invalid += 1
        continue

    key = (round(longitude, 7), round(latitude, 7), address.lower())

    if key in seen:
        continue

    seen.add(key)

    rows.append({
        "name": attributes.get("NAME") or "Recycling Bin",
        "address": address,
        "latitude": latitude,
        "longitude": longitude,
        "operating_hours": "",
        "status": "Information Outdated",
        "source": "NEA Recycling Bins"
    })

with OUTPUT.open("w", newline="", encoding="utf-8") as file:
    writer = csv.DictWriter(
        file,
        fieldnames=[
            "name", "address", "latitude", "longitude",
            "operating_hours", "status", "source"
        ]
    )

    writer.writeheader()
    writer.writerows(rows)

print("Original features:", len(geojson["features"]))
print("Valid unique locations:", len(rows))
print("Skipped invalid records:", invalid)
print("Skipped duplicates:", len(geojson["features"]) - len(rows) - invalid)
print("CSV saved to:", OUTPUT)
