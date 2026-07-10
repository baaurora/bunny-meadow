#!/usr/bin/env python3
"""
Build data.js for Bunny Meadow from the source workbook.

Parses Interactive_Marathon_Coaching_Dashboard_to_Nov1.xlsm (no openpyxl needed --
reads the OOXML parts directly) and emits ../data.js as `window.PLAN = {...}`.

Nutrition / training numbers are copied verbatim from the workbook. Nothing is
altered here; the app only wraps this data in a gamified UI.

Usage:
    python3 tools/build_data.py [path/to/workbook.xlsm]
"""
import json
import sys
import zipfile
from datetime import date, timedelta
from pathlib import Path
from xml.etree import ElementTree as ET

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
RNS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"

DEFAULT_SRC = Path.home() / "Downloads" / "Interactive_Marathon_Coaching_Dashboard_to_Nov1.xlsm"
OUT = Path(__file__).resolve().parent.parent / "data.js"

# Excel's 1900 date system: serial 1 == 1900-01-01, with the well-known
# phantom leap-day bug, so serial N maps to 1899-12-30 + N days.
EXCEL_EPOCH = date(1899, 12, 30)


def excel_serial_to_iso(serial):
    return (EXCEL_EPOCH + timedelta(days=int(round(float(serial))))).isoformat()


def col_num(ref):
    letters = "".join(c for c in ref if c.isalpha())
    n = 0
    for c in letters:
        n = n * 26 + (ord(c) - 64)
    return n


def row_num(ref):
    return int("".join(c for c in ref if c.isdigit()))


def load_shared_strings(z):
    out = []
    root = ET.fromstring(z.read("xl/sharedStrings.xml"))
    for si in root.findall(NS + "si"):
        out.append("".join(t.text or "" for t in si.iter(NS + "t")))
    return out


def sheet_map(z):
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
    relmap = {r.get("Id"): r.get("Target") for r in rels}
    out = {}
    for s in wb.iter(NS + "sheet"):
        target = relmap[s.get(RNS + "id")]
        if not target.startswith("xl/"):
            target = "xl/" + target
        out[s.get("name")] = target
    return out


def read_grid(z, path, ss):
    """Return list of row-dicts keyed by 1-based column number."""
    sh = ET.fromstring(z.read(path))
    rows = {}
    for c in sh.iter(NS + "c"):
        ref = c.get("r")
        if not ref:
            continue
        t = c.get("t")
        v = c.find(NS + "v")
        val = None
        if v is not None:
            val = ss[int(v.text)] if t == "s" else v.text
        else:
            iss = c.find(NS + "is")
            if iss is not None:
                val = "".join(x.text or "" for x in iss.iter(NS + "t"))
        if val is None or val == "":
            continue
        rows.setdefault(row_num(ref), {})[col_num(ref)] = val
    return rows


def num(v):
    if v is None:
        return None
    try:
        f = float(v)
        return int(f) if f.is_integer() else f
    except (TypeError, ValueError):
        return v


def rows_as_records(rows, headers_row=1):
    """Turn a grid into a list of dicts using row `headers_row` as keys."""
    if headers_row not in rows:
        return []
    headers = {c: rows[headers_row][c] for c in rows[headers_row]}
    records = []
    for r in sorted(rows):
        if r <= headers_row:
            continue
        rec = {}
        for c, key in headers.items():
            if c in rows[r]:
                rec[key] = rows[r][c]
        if rec:
            records.append(rec)
    return records


def main():
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SRC
    if not src.exists():
        sys.exit(f"Source workbook not found: {src}")

    z = zipfile.ZipFile(src)
    ss = load_shared_strings(z)
    sheets = sheet_map(z)

    # ---- Daily Plan ----
    dp = read_grid(z, sheets["Daily Plan"], ss)
    dp_headers = {c: dp[1][c] for c in dp[1]}
    NUM_FIELDS = {
        "Miles", "Cal target", "Protein target", "Carb target", "Fat target",
        "Fiber target", "Sodium max", "Potassium target", "Sat fat max",
    }
    days = []
    for r in sorted(dp):
        if r == 1:
            continue
        raw = {dp_headers[c]: dp[r][c] for c in dp[r] if c in dp_headers}
        if "Date" not in raw:
            continue
        day = {
            "date": excel_serial_to_iso(raw["Date"]),
            "week": num(raw.get("Week")),
            "weekday": raw.get("Day"),
            "phase": raw.get("Phase"),
            "training": raw.get("Training"),
            "miles": num(raw.get("Miles")),
            "notes": raw.get("Run / Strength notes"),
            "targets": {
                "cal": num(raw.get("Cal target")),
                "protein": num(raw.get("Protein target")),
                "carb": num(raw.get("Carb target")),
                "fat": num(raw.get("Fat target")),
                "fiber": num(raw.get("Fiber target")),
                "sodiumMax": num(raw.get("Sodium max")),
                "potassium": num(raw.get("Potassium target")),
                "satFatMax": num(raw.get("Sat fat max")),
            },
            "fuel": {
                "pre": raw.get("Pre-run fuel"),
                "during": raw.get("During-run fuel"),
                "post": raw.get("Post-run fuel"),
            },
            "meals": {
                "breakfast": raw.get("Breakfast"),
                "lunch": raw.get("Lunch"),
                "dinner": raw.get("Dinner"),
                "snack1": raw.get("Snack 1"),
                "snack2": raw.get("Snack 2"),
            },
        }
        days.append(day)

    # ---- Meal Library ----
    ml = rows_as_records(read_grid(z, sheets["Meal Library"], ss))
    meals = []
    for m in ml:
        meals.append({
            "name": m.get("Meal"),
            "type": m.get("Type"),
            "cal": num(m.get("Calories")),
            "protein": num(m.get("Protein")),
            "carbs": num(m.get("Carbs")),
            "fat": num(m.get("Fat")),
            "fiber": num(m.get("Fiber")),
            "sodium": num(m.get("Sodium")),
            "potassium": num(m.get("Potassium")),
            "satFat": num(m.get("Sat Fat")),
            "why": m.get("Why it fits"),
        })

    # ---- Fueling Guide ----
    fuel_guide = [
        {"scenario": r.get("Scenario"), "timing": r.get("Timing"),
         "what": r.get("What to do"), "goal": r.get("Goal")}
        for r in rows_as_records(read_grid(z, sheets["Fueling Guide"], ss))
    ]

    # ---- Recipe Notes ----
    recipes = [
        {"recipe": r.get("Recipe"), "portions": r.get("Portions"),
         "prep": r.get("Prep notes"),
         "adjust": r.get("Blood pressure / LDL adjustment")}
        for r in rows_as_records(read_grid(z, sheets["Recipe Notes"], ss))
    ]

    # ---- Weekly Grocery ----
    grocery = []
    for r in rows_as_records(read_grid(z, sheets["Weekly Grocery"], ss)):
        grocery.append({
            "week": num(r.get("Week")), "dates": r.get("Dates"),
            "produce": r.get("Produce"), "proteins": r.get("Proteins"),
            "carbs": r.get("Carbs"), "fats": r.get("Healthy fats"),
            "pantry": r.get("Pantry / flavor"), "notes": r.get("Notes"),
        })

    # ---- Weekly Rollup (planned targets) ----
    rollup = []
    for r in rows_as_records(read_grid(z, sheets["Weekly Rollup"], ss)):
        s, e = r.get("Start"), r.get("End")
        rollup.append({
            "week": num(r.get("Week")),
            "start": excel_serial_to_iso(s) if s else None,
            "end": excel_serial_to_iso(e) if e else None,
            "phase": r.get("Phase"),
            "plannedMiles": num(r.get("Planned miles")),
        })

    # ---- Targets + Sources ----
    ts = read_grid(z, sheets["Targets + Sources"], ss)
    targets_info, sources = [], []
    for r in sorted(ts):
        if r == 1:
            continue
        cells = ts[r]
        label, value, note = cells.get(1), cells.get(2), cells.get(3)
        if label == "Source":
            sources.append({"url": value, "note": note})
        elif label:
            targets_info.append({"label": label, "value": value, "note": note})

    data = {
        "meta": {
            "title": "Bunny Meadow",
            "startDate": days[0]["date"] if days else None,
            "raceDate": days[-1]["date"] if days else None,
            "totalDays": len(days),
            "totalWeeks": max((d["week"] for d in days if d["week"]), default=0),
            "goalWeightLb": 119,
            "startWeightLb": 134,
            "heightIn": 61.75,
        },
        "days": days,
        "meals": meals,
        "fuelGuide": fuel_guide,
        "recipes": recipes,
        "grocery": grocery,
        "rollup": rollup,
        "targetsInfo": targets_info,
        "sources": sources,
    }

    js = "// AUTO-GENERATED by tools/build_data.py from the source workbook. Do not edit by hand.\n"
    js += "window.PLAN = " + json.dumps(data, ensure_ascii=False, indent=2) + ";\n"
    OUT.write_text(js, encoding="utf-8")
    print(f"Wrote {OUT} ({len(days)} days, {len(meals)} meals, {len(grocery)} grocery weeks)")
    print(f"Plan: {data['meta']['startDate']} -> {data['meta']['raceDate']}")


if __name__ == "__main__":
    main()
