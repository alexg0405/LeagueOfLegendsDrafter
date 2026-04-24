"""
Read matches_raw.json and fill match_participants + match_meta (id-based, for downstream ETL).

  python -m training.riot_ingest.extract_matches --db training/data/riot_matches.db

Re-run safe: REPLACE INTO participants by primary key; skips rows with no parseable data.
"""
from __future__ import annotations

import argparse
import json
import sqlite3
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

DEFAULT_DB = Path("training/data/riot_matches.db")


def _side(team_id: int) -> str:
    return "blue" if team_id == 100 else "red"


def _participant_rows(payload: dict) -> Tuple[Optional[Dict[str, Any]], List[Tuple]]:
    info = payload.get("info")
    if not info:
        return None, []
    match_id = str(payload.get("metadata", {}).get("matchId", "") or "")
    if not match_id:
        return None, []
    ppl = info.get("participants") or []
    out: List[Tuple] = []
    for p in ppl:
        puuid = p.get("puuid")
        if not puuid:
            continue
        tid = p.get("teamId")
        if tid not in (100, 200):
            continue
        out.append(
            (
                match_id,
                str(puuid),
                _side(int(tid)),
                int(p.get("championId") or 0) or None,
                p.get("championName") or None,
                (p.get("teamPosition") or p.get("individualPosition") or "") or None,
                1 if p.get("win") else 0,
            )
        )
    return (
        {
            "match_id": match_id,
            "game_version": info.get("gameVersion"),
            "queue_id": info.get("queueId"),
            "map_id": info.get("mapId"),
            "game_duration_s": info.get("gameDuration"),
        },
        out,
    )


def run(db: Path, limit: Optional[int] = None) -> int:
    con = sqlite3.connect(str(db))
    try:
        q = "SELECT match_id, json FROM matches_raw"
        if limit:
            q += f" LIMIT {int(limit)}"
        rows = 0
        p_rows = 0
        for match_id, raw in con.execute(q):
            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                continue
            meta, parts = _participant_rows(payload)
            if not parts:
                continue
            if meta and meta.get("match_id"):
                con.execute(
                    """
                    INSERT OR REPLACE INTO match_meta
                    (match_id, game_version, queue_id, map_id, game_duration_s)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (
                        meta["match_id"],
                        meta.get("game_version"),
                        meta.get("queue_id"),
                        meta.get("map_id"),
                        meta.get("game_duration_s"),
                    ),
                )
            for row in parts:
                con.execute(
                    """
                    INSERT OR REPLACE INTO match_participants
                    (match_id, puuid, side, champion_id, champion_name, team_position, win)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    row,
                )
                p_rows += 1
            rows += 1
        con.commit()
    finally:
        con.close()
    print(f"matches processed: {rows}  participants upserted: {p_rows}")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--db", type=Path, default=DEFAULT_DB)
    ap.add_argument("--limit", type=int, default=None, help="only process first N raw rows (debug)")
    args = ap.parse_args()
    if not args.db.is_file():
        raise SystemExit(f"Missing {args.db} — run collect_riot_matches.py first")
    return run(args.db, limit=args.limit)


if __name__ == "__main__":
    raise SystemExit(main())
