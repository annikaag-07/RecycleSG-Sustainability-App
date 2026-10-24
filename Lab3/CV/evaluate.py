"""Measure accuracy on your own photos.

Put photos in test_images/<material>/ using these folder names:
  plastic, e-waste, batteries, clothing, cardboard, glass, lighting waste
Run:  python evaluate.py            (real model, needs GEMINI_API_KEY)
      CV_MOCK=1 python evaluate.py  (plumbing check only, filenames decide)
Writes results/results.csv and results/summary.md
"""
import argparse
import csv
import os
import statistics
import time

from classifier import MATERIALS, UNCLEAR, classify_image

MIME = {".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".jpeg": "image/jpeg"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default="test_images")
    ap.add_argument("--delay", type=float, default=4.0, help="seconds between calls (free-tier rate limit)")
    a = ap.parse_args()

    rows = []
    for truth in MATERIALS:
        folder = os.path.join(a.dir, truth)
        if not os.path.isdir(folder):
            continue
        for name in sorted(os.listdir(folder)):
            ext = os.path.splitext(name)[1].lower()
            if ext not in MIME:
                continue
            with open(os.path.join(folder, name), "rb") as f:
                r = classify_image(f.read(), MIME[ext], truth + "_" + name)
            pred = r["suggestion"] or UNCLEAR
            rows.append({"truth": truth, "file": name, "pred": pred, "status": r["status"],
                         "confidence": r["confidence"], "latency_ms": r["latency_ms"], "reason": r["reason"]})
            print(f"{truth:15s} {name:25s} -> {pred:15s} {r['status']:11s} {r['confidence']}")
            if os.environ.get("CV_MOCK") != "1":
                time.sleep(a.delay)

    if not rows:
        print(f"No images found under {a.dir}/<material>/ . Add some photos first.")
        return

    os.makedirs("results", exist_ok=True)
    with open("results/results.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)

    labels = MATERIALS + [UNCLEAR]
    matrix = {t: {p: 0 for p in labels} for t in MATERIALS}
    for r in rows:
        matrix[r["truth"]][r["pred"]] += 1
    correct = sum(1 for r in rows if r["truth"] == r["pred"])
    confident = [r for r in rows if r["status"] == "ok"]
    conf_correct = sum(1 for r in confident if r["truth"] == r["pred"])
    lat = [r["latency_ms"] for r in rows if r["status"] != "unavailable"]

    out = ["# CV evaluation", "",
           f"Images: {len(rows)}",
           f"Top-1 accuracy (suggestion vs truth): {correct}/{len(rows)} = {correct/len(rows):.1%}",
           f"Auto-accepted (confidence at or above threshold): {len(confident)}/{len(rows)}",
           f"Accuracy among auto-accepted: {conf_correct}/{len(confident)}" if confident else "No auto-accepted results",
           f"Median latency: {statistics.median(lat):.0f} ms" if lat else "No latency data",
           "", "## Per class accuracy", ""]
    for t in MATERIALS:
        n = sum(matrix[t].values())
        if n:
            out.append(f"- {t}: {matrix[t][t]}/{n} = {matrix[t][t]/n:.0%}")
    out += ["", "## Confusion matrix (rows = truth, columns = prediction)", "",
            "| truth | " + " | ".join(labels) + " |", "|---|" + "---|" * len(labels)]
    for t in MATERIALS:
        if sum(matrix[t].values()):
            out.append(f"| {t} | " + " | ".join(str(matrix[t][p]) for p in labels) + " |")
    text = "\n".join(out)
    with open("results/summary.md", "w") as f:
        f.write(text + "\n")
    print("\n" + text)


if __name__ == "__main__":
    main()
