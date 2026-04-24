#!/usr/bin/env python3
"""
Ingest Riot match-v5 JSON files into SQLite (match_meta + team_perspective).

Usage:
  python training/etl/ingest.py --db training/nexus_training.db --file path/to/match.json
  python training/etl/ingest.py --db training/nexus_training.db --dir path/to/folder
  python training/etl/ingest.py --schema training/schema.sql --db training/nexus_training.db --file match.json

Requires: training/schema.sql applied once (or pass --schema to run creates).
"""
from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

from parse_matchv5 import parse_match_to_rows


def ensure_schema(conn: sqlite3.Connection, schema_path: Optional[Path]) -> None:
    if not schema_path or not schema_path.is_file():
        return
    conn.executescript(schema_path.read_text(encoding="utf-8"))
    conn.commit()


def upsert_match_meta(conn: sqlite3.Connection, match: Dict[str, Any], platform_id: str) -> None:
    meta = match.get("metadata") or {}
    info = match.get("info") or {}
    match_id = str(meta.get("matchId") or "")
    if not match_id:
        return
    conn.execute(
        """
        INSERT INTO match_meta (match_id, platform_id, data_version, queue_id, game_duration_s,
          game_creation_ms, map_id, region)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(match_id, platform_id) DO UPDATE SET
          data_version=excluded.data_version,
          queue_id=excluded.queue_id,
          game_duration_s=excluded.game_duration_s
        """,
        (
            match_id,
            platform_id,
            str(info.get("gameVersion") or ""),
            int(info.get("queueId") or 0),
            int(info.get("gameDuration") or 0),
            int(info.get("gameCreation") or 0),
            int(info.get("mapId") or 0),
            "unknown",
        ),
    )


def insert_perspectives(
    conn: sqlite3.Connection,
    rows: List[Dict[str, Any]],
    match: Dict[str, Any],
) -> int:
    if not rows:
        return 0
    platform_id = rows[0]["platform_id"]
    upsert_match_meta(conn, match, platform_id)
    n = 0
    for r in rows:
        conn.execute(
            """
            INSERT INTO team_perspective (
              match_id, platform_id, team_id, side, patch_bucket, queue_bucket, tier_bucket,
              region, won, role_picks_json, enemy_role_picks_json, bans_friendly_json, bans_enemy_json, row_hash
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(match_id, platform_id, team_id) DO UPDATE SET
              won=excluded.won,
              role_picks_json=excluded.role_picks_json,
              enemy_role_picks_json=excluded.enemy_role_picks_json,
              bans_friendly_json=excluded.bans_friendly_json,
              bans_enemy_json=excluded.bans_enemy_json,
              row_hash=excluded.row_hash
            """,
            (
                r["match_id"],
                r["platform_id"],
                r["team_id"],
                r["side"],
                r["patch_bucket"],
                r["queue_bucket"],
                (r.get("tier_bucket") or "all") or "all",
                r.get("region") or "unknown",
                r["won"],
                r["role_picks_json"],
                r["enemy_role_picks_json"],
                r.get("bans_friendly_json") or "[]",
                r.get("bans_enemy_json") or "[]",
                r.get("row_hash") or "",
            ),
        )
        n += 1
    return n


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", type=Path, default=Path("training/nexus_training.db"))
    ap.add_argument("--schema", type=Path, default=Path("training/schema.sql"))
    ap.add_argument("--file", type=Path, help="Single match-v5 json")
    ap.add_argument("--dir", type=Path, help="Directory of .json")
    ap.add_argument("--tier-bucket", default="all", help="Label for all ingested rows (until Riot provides tier in match)")
    ap.add_argument("--region", default="unknown")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if not args.file and not args.dir:
        ap.error("Pass --file or --dir")
    paths: List[Path] = []
    if args.file:
        paths.append(args.file)
    if args.dir and args.dir.is_dir():
        paths.extend(sorted(args.dir.glob("*.json")))

    if not args.dry_run:
        args.db.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(args.db))
        ensure_schema(conn, args.schema)
    else:
        conn = None

    total = 0
    for p in paths:
        if not p.is_file():
            print("skip (missing):", p, file=sys.stderr)
            continue
        match = json.loads(p.read_text(encoding="utf-8"))
        rows = parse_match_to_rows(
            match, tier_bucket=args.tier_bucket, region=args.region
        )
        if not rows:
            print("0 rows", p.name, file=sys.stderr)
            continue
        if args.dry_run:
            print("OK", p.name, "-> 2 rows", rows[0]["patch_bucket"], rows[0]["queue_bucket"])
            total += 2
            continue
        assert conn is not None
        n = insert_perspectives(conn, rows, match)
        conn.commit()
        print("ingested", p.name, n, "rows")
        total += n
    if conn:
        conn.close()
    print("done total rows:", total)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
