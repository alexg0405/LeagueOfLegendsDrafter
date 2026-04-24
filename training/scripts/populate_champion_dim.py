"""
Fill champion_dim from Data Dragon en_US/champion.json (Riot’s canonical id ↔ name map).

  python -m training.scripts.populate_champion_dim --db training/nexus_training.db
  python -m training.scripts.populate_champion_dim --db training/nexus_training.db --json path/to/champion.json

Assumes training/schema.sql has been applied (champion_dim table).
"""
from __future__ import annotations

import argparse
import json
import re
import sqlite3
import sys
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Tuple


def _norm(s: str) -> str:
    t = (s or "").strip().lower()
    t = re.sub(r"[^a-z0-9]+", "", t)
    return t


def fetch_ddragon() -> Dict[str, Any]:
    vurl = "https://ddragon.leagueoflegends.com/api/versions.json"
    with urllib.request.urlopen(vurl, timeout=60) as r:
        versions = json.loads(r.read().decode("utf-8"))
    ver = versions[0]
    curl = f"https://ddragon.leagueoflegends.com/cdn/{ver}/data/en_US/champion.json"
    with urllib.request.urlopen(curl, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def load_json(path: Path) -> Dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def rows_from_data(data: Dict[str, Any]) -> List[Tuple[int, str, str]]:
    out: List[Tuple[int, str, str]] = []
    for _key, blob in (data.get("data") or {}).items():
        if not isinstance(blob, dict):
            continue
        try:
            cid = int(blob.get("key", 0))
        except (TypeError, ValueError):
            continue
        if cid <= 0:
            continue
        name = str(blob.get("name", "") or blob.get("id", ""))
        if not name:
            continue
        out.append((cid, name, _norm(name)))
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--db", type=Path, default=Path("training/nexus_training.db"))
    ap.add_argument("--json", type=Path, default=None, help="local champion.json; skip fetch")
    args = ap.parse_args()

    if not args.db.is_file():
        print("DB not found:", args.db, file=sys.stderr)
        return 1

    if args.json and args.json.is_file():
        raw = load_json(args.json)
    else:
        print("fetching DDragon champion.json …", file=sys.stderr)
        raw = fetch_ddragon()
    data = raw
    if "data" not in data and "json" in str(type(raw)):
        data = {"data": raw} if isinstance(raw, dict) else {"data": {}}
    rows = rows_from_data(data)
    con = sqlite3.connect(str(args.db))
    try:
        con.executescript(
            "CREATE TABLE IF NOT EXISTS champion_dim ("
            "  champion_id INTEGER PRIMARY KEY, champion_name TEXT NOT NULL, normalized_name TEXT);"
        )
        con.executemany(
            "INSERT OR REPLACE INTO champion_dim (champion_id, champion_name, normalized_name) VALUES (?, ?, ?)",
            rows,
        )
        con.commit()
    finally:
        con.close()
    print("champion_dim rows:", len(rows), file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
