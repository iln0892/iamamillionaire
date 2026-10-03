"""Freeze official WestLotto archives into a validated, reproducible SQLite snapshot."""
import argparse
import csv
import hashlib
import io
import json
import re
import sqlite3
import urllib.request
import zipfile
from datetime import datetime, date
from pathlib import Path
from zoneinfo import ZoneInfo
import openpyxl
import xlrd

ROOT = Path(__file__).resolve().parents[1]
BASE = "https://www.westlotto.de"
ARCHIVE = BASE + "/westlotto-medien/zahlen-fakten/gewinnzahlendownload/"
parser = argparse.ArgumentParser()
parser.add_argument("--through", type=date.fromisoformat, default=datetime.now(ZoneInfo("Europe/Berlin")).date())
args = parser.parse_args()
draws = {}
sources = []

def fetch(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Millionaire-Lotto-Lab/1.0"}), timeout=60) as r:
        content = r.read()
    sources.append({"url": url, "sha256": hashlib.sha256(content).hexdigest()})
    archive = zipfile.ZipFile(io.BytesIO(content))
    name = archive.namelist()[0]
    return name, archive.read(name)

def parse_date(value, year):
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, str) and re.fullmatch(r"\s*\d{1,2}\.\d{1,2}\.\s*(\d{4})?\s*", value):
        parts = value.strip().split(".")
        return date(int(parts[2]) if parts[2] else year, int(parts[1]), int(parts[0]))
    return None

def integer(value):
    if isinstance(value, bool):
        raise ValueError("boolean instead of number")
    result = int(value)
    if float(value) != result:
        raise ValueError("non-integer number")
    return result

def add(game, day, numbers, extras, variant="main", quotas=None):
    if day > args.through:
        return
    numbers = sorted(integer(n) for n in numbers)
    extras = sorted(integer(n) for n in extras)
    maximum, count = (49, 6) if game == "lotto" else (50, 5)
    assert len(numbers) == count and len(set(numbers)) == count and all(1 <= n <= maximum for n in numbers), (game, day, numbers)
    if game == "lotto":
        assert len(extras) <= 1 and all(0 <= n <= 9 for n in extras)
    else:
        extra_max = 8 if day < date(2014, 10, 10) else 10 if day < date(2022, 3, 25) else 12
        assert len(extras) == 2 and len(set(extras)) == 2 and all(1 <= n <= extra_max for n in extras)
    key = (game, day.isoformat(), variant)
    item = dict(game=game, date=day.isoformat(), variant=variant, numbers=numbers, extras=extras, quotas=quotas or [], source="WestLotto")
    if key in draws and draws[key] != item:
        raise ValueError(f"Conflicting source rows: {key}")
    draws[key] = item

for game, filename in [("lotto", "lotto6aus49.zip"), ("euro", "eurojackpot.zip")]:
    name, content = fetch(ARCHIVE + filename)
    workbook = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    for sheet in workbook:
        if not sheet.title.isdigit():
            continue
        year = int(sheet.title)
        rows = list(sheet.iter_rows(values_only=True))
        start = 3 if game == "euro" or any(r[2] and "Ziehung" in str(r[2]) for r in rows[:7]) else 2
        for row in rows:
            day = parse_date(row[1], year)
            if not day or all(n is None for n in row[3:8]):
                continue
            if game == "euro":
                add(game, day, row[3:8], row[8:10])
            else:
                super_index = start + 7 if year <= 2013 else start + 6
                superzahl = row[super_index] if len(row) > super_index else None
                extras = [superzahl] if isinstance(superzahl, (int, float)) and 0 <= superzahl <= 9 else []
                variant = "special" if "*" in str(row[0]) or "XXX" in row else "main"
                quotas = []
                if day >= date(2022, 1, 1) and variant == "main":
                    for rank in range(8):
                        winner = row[11 + 2 * rank]
                        quotas.append(float(row[12 + 2 * rank]) if isinstance(winner, (int, float)) and winner > 0 else None)
                    quotas.append(6.0 if isinstance(row[27], (int, float)) and row[27] > 0 else None)
                add(game, day, row[start:start + 6], extras, variant, quotas)

name, content = fetch(ARCHIVE + "lotto_mittwoch.zip")
workbook = xlrd.open_workbook(file_contents=content)
for sheet in workbook.sheets():
    if not sheet.name.isdigit() or int(sheet.name) < 1986:
        continue
    previous_day = None
    for i in range(sheet.nrows):
        row = sheet.row_values(i)
        if isinstance(row[1], (int, float)) and 30000 < row[1] < 50000:
            previous_day = xlrd.xldate_as_datetime(row[1], workbook.datemode).date()
        elif parse_date(row[1], int(sheet.name)):
            previous_day = parse_date(row[1], int(sheet.name))
        elif not (str(row[2]).strip() == "B" and previous_day):
            continue
        day = previous_day
        if day < date(1986, 6, 4) or day >= date(2000, 12, 6):
            continue  # earlier Wednesday game was 7/38, a different lottery
        variant = str(row[2]).strip() or "A"
        superzahl = row[10] if int(sheet.name) >= 1995 else None
        if isinstance(superzahl, str) and "+" in superzahl:
            superzahl = superzahl.split("+")[0 if variant == "A" else 1]
        extras = [superzahl] if str(superzahl).strip().isdigit() or isinstance(superzahl, (int, float)) else []
        start = 4 if int(sheet.name) == 1986 else 3
        add("lotto", day, row[start:start + 6], extras, variant)

def money(value):
    return float(value.strip().replace(".", "").replace(",", "."))

for game, code in [("lotto", "LOTTO"), ("euro", "EJ")]:
    url = BASE + f"/wlinfo/WL_InfoService?gruppe=ErgebnisDownload&client=wldl&jahr_von=2022&jahr_bis={args.through.year}&spielart={code}&format=csv"
    name, content = fetch(url)
    for row in csv.reader(io.StringIO(content.decode("cp1252")), delimiter=";"):
        if not row or not re.fullmatch(r"\d{2}\.\d{2}\.\d{4}", row[0].strip()):
            continue
        day = datetime.strptime(row[0].strip(), "%d.%m.%Y").date()
        start, winner_start, ranks = (2, 14, 9) if game == "lotto" else (1, 9, 12)
        quotas = []
        for rank in range(ranks):
            winner = row[winner_start + 2 * rank].strip().replace(".", "")
            quotas.append(money(row[winner_start + 2 * rank + 1]) if winner.isdigit() and int(winner) > 0 else None)
        add(game, day, row[start:start + (6 if game == "lotto" else 5)], [row[10]] if game == "lotto" else row[6:8], quotas=quotas)

out = ROOT / "public" / "data"
out.mkdir(parents=True, exist_ok=True)
temporary = out / "lottery.tmp.sqlite"
temporary.unlink(missing_ok=True)
db = sqlite3.connect(temporary)
db.executescript('''
PRAGMA user_version = 1;
CREATE TABLE draws (game TEXT NOT NULL, date TEXT NOT NULL, variant TEXT NOT NULL DEFAULT 'main', numbers TEXT NOT NULL, extras TEXT NOT NULL, quotas TEXT NOT NULL, source TEXT NOT NULL, PRIMARY KEY(game,date,variant));
CREATE TABLE tips (id TEXT PRIMARY KEY, game TEXT NOT NULL, created TEXT NOT NULL, numbers TEXT NOT NULL, extras TEXT NOT NULL, explanation TEXT NOT NULL);
CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
''')
ordered = sorted(draws.values(), key=lambda d: (d["game"], d["date"], d["variant"]))
db.executemany("INSERT INTO draws VALUES (?,?,?,?,?,?,?)", [(d["game"],d["date"],d["variant"],json.dumps(d["numbers"]),json.dumps(d["extras"]),json.dumps(d["quotas"]),d["source"]) for d in ordered])
manifest = {"version": 1, "generatedAt": datetime.now(ZoneInfo("Europe/Berlin")).isoformat(), "through": args.through.isoformat(), "sources": sources, "games": {}}
for game in ["lotto", "euro"]:
    items = [d for d in ordered if d["game"] == game]
    manifest["games"][game] = {"count": len(items), "first": items[0]["date"], "last": items[-1]["date"], "quotasFrom": "2022-01-01"}
manifest["notes"] = ["WestLotto archive including Wednesday A/B draws from 1986-06-04; former 7/38 excluded.", "Historical quotas standardized from 2022; unoccupied prize classes have null payouts.", "Older supernumbers are absent when the source has no unambiguous value."]
db.execute("INSERT INTO metadata VALUES ('snapshot',?)", (manifest["generatedAt"],))
db.commit()
assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
db.close()
temporary.replace(out / "lottery.sqlite")
(out / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
print(json.dumps(manifest["games"], indent=2))
