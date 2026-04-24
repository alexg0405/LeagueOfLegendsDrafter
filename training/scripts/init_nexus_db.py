"""
Create or upgrade training/nexus_training.db by running training/schema.sql (stdlib sqlite3;
no `sqlite3` CLI required — use this on Windows if `npm run train:init-db` failed).

  python -m training.scripts.init_nexus_db
  python -m training.scripts.init_nexus_db --db path/to/any.db
"""
from __future__ import annotations

import argparse
import sqlite3
import sys
from pathlib import Path


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    training_dir = Path(__file__).resolve().parent.parent
    ap.add_argument(
        "--db",
        type=Path,
        default=training_dir / "nexus_training.db",
        help="Default: <repo>/training/nexus_training.db",
    )
    ap.add_argument(
        "--schema",
        type=Path,
        default=training_dir / "schema.sql",
        help="Default: training/schema.sql",
    )
    args = ap.parse_args()
    if not args.schema.is_file():
        print("Schema not found:", args.schema, file=sys.stderr)
        return 1
    args.db.parent.mkdir(parents=True, exist_ok=True)
    sql = args.schema.read_text(encoding="utf-8")
    con = sqlite3.connect(str(args.db))
    try:
        con.executescript(sql)
        con.commit()
    finally:
        con.close()
    print("OK:", args.db, "(applied", args.schema.name + ")")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
