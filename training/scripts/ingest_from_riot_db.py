"""
Load match-v5 JSON from training/data/riot_matches.db (matches_raw) into nexus_training.db.

Reuses the same parse + insert path as training/etl/ingest.py (no temp JSON files).

  python -m training.scripts.ingest_from_riot_db
  python -m training.scripts.ingest_from_riot_db --riot-db training/data/riot_matches.db
"""
from __future__ import annotations

import argparse
import importlib
import json
import sqlite3
import sys
from pathlib import Path
from typing import Any, Dict

# training/etl/ingest.py loads parse_matchv5 from the same directory
_ETL = Path(__file__).resolve().parent.parent / "etl"
if str(_ETL) not in sys.path:
    sys.path.insert(0, str(_ETL))
ingest = importlib.import_module("ingest")


def _repo_root() -> Path:
    return Path(__file__).resolve().parent.parent.parent


def main() -> int:
    root = _repo_root()
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--riot-db",
        type=Path,
        default=root / "training" / "data" / "riot_matches.db",
        help="SQLite DB with matches_raw (from riot:collect)",
    )
    ap.add_argument(
        "--db",
        type=Path,
        default=root / "training" / "nexus_training.db",
        help="Nexus training DB (match_meta + team_perspective)",
    )
    ap.add_argument(
        "--schema",
        type=Path,
        default=root / "training" / "schema.sql",
    )
    ap.add_argument("--tier-bucket", default="all")
    ap.add_argument("--region", default="unknown")
    ap.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Max matches to process (for testing)",
    )
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if not args.riot_db.is_file():
        print("riot db not found:", args.riot_db, file=sys.stderr)
        print(
            "  Run: npm run riot:collect -- --csv training/riot_ingest/seed/riot_ids.example.csv",
            file=sys.stderr,
        )
        return 1

    rcon = sqlite3.connect(str(args.riot_db))
    try:
        n_raw = rcon.execute("SELECT COUNT(1) FROM matches_raw").fetchone()[0]
    except sqlite3.OperationalError as e:
        rcon.close()
        print("matches_raw missing or unreadable:", e, file=sys.stderr)
        return 1
    rcon.close()

    if n_raw == 0:
        print("matches_raw is empty; collect matches first (riot:collect).", file=sys.stderr)
        return 1

    if not args.dry_run and not args.db.is_file():
        print("nexus db not found; run: npm run train:init-db", file=sys.stderr)
        return 1

    q = "SELECT match_id, json FROM matches_raw ORDER BY match_id"
    if args.limit is not None:
        q += f" LIMIT {int(args.limit)}"

    con: sqlite3.Connection | None = None
    if not args.dry_run:
        con = sqlite3.connect(str(args.db))
        ingest.ensure_schema(con, args.schema if args.schema.is_file() else None)

    rcon = sqlite3.connect(str(args.riot_db))
    total = 0
    skipped = 0
    for _mid, raw in rcon.execute(q):
        try:
            match: Dict[str, Any] = json.loads(raw)
        except json.JSONDecodeError:
            skipped += 1
            continue
        rows = ingest.parse_match_to_rows(
            match, tier_bucket=args.tier_bucket, region=args.region
        )
        if not rows:
            skipped += 1
            continue
        if args.dry_run:
            total += len(rows)
            print("OK", (match.get("metadata") or {}).get("matchId", "?"), "->", len(rows), "rows")
            continue
        assert con is not None
        n = ingest.insert_perspectives(con, rows, match)
        con.commit()
        total += n
    rcon.close()
    if con:
        con.close()

    if args.dry_run:
        print(
            "dry-run:",
            total,
            "team_perspective rows;",
            skipped,
            "raw rows skipped (unparseable or not SR/5v5)",
            file=sys.stderr,
        )
        return 0
    print("ingested", total, "team_perspective rows; skipped", skipped, "raw matches")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
