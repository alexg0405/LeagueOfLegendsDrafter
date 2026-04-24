"""
Load runtime SQLite tables into dicts keyed as in the spec (tuple keys, float scores).
champ_tags rows become tags[champ] = { frontline, engage, ... }.
"""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from .scorer import DraftScorer

_FLOAT_COLS = (
    "frontline",
    "engage",
    "peel",
    "magic",
    "physical",
    "range_score",
    "scaling",
    "cc",
)


def load_baseline_row(db: Path) -> Dict[Tuple[Any, ...], float]:
    out: Dict[Tuple[Any, ...], float] = {}
    con = sqlite3.connect(str(db))
    try:
        for row in con.execute(
            "SELECT patch, queue, tier, role, champ, games, wins, score FROM champ_baseline"
        ):
            p, q, t, r, c, g, w, s = row
            out[(p, q, t, r, c)] = float(s)
    finally:
        con.close()
    return out


def load_matchup_rows(db: Path) -> Dict[Tuple[Any, ...], float]:
    out: Dict[Tuple[Any, ...], float] = {}
    con = sqlite3.connect(str(db))
    try:
        for row in con.execute(
            "SELECT patch, queue, tier, role, champ, enemy_role, enemy_champ, games, score "
            "FROM champ_matchup"
        ):
            p, q, t, r, c, er, ec, g, s = row
            out[(p, q, t, r, c, er, ec)] = float(s)
    finally:
        con.close()
    return out


def load_synergy_rows(db: Path) -> Dict[Tuple[Any, ...], float]:
    out: Dict[Tuple[Any, ...], float] = {}
    con = sqlite3.connect(str(db))
    try:
        for row in con.execute(
            "SELECT patch, queue, tier, role, champ, ally_role, ally_champ, games, score "
            "FROM champ_synergy"
        ):
            p, q, t, r, c, ar, ac, g, s = row
            out[(p, q, t, r, c, ar, ac)] = float(s)
    finally:
        con.close()
    return out


def load_comfort_rows(db: Path) -> Dict[Tuple[Any, ...], float]:
    out: Dict[Tuple[Any, ...], float] = {}
    con = sqlite3.connect(str(db))
    try:
        for row in con.execute("SELECT role, champ, games, wins, score FROM player_comfort"):
            r, c, g, w, s = row
            out[(r, c)] = float(s)
    finally:
        con.close()
    return out


def load_tags_from_db(db: Path) -> Dict[str, Dict[str, float]]:
    con = sqlite3.connect(str(db))
    try:
        cur = con.execute(f"SELECT champ, {', '.join(_FLOAT_COLS)} FROM champ_tags")
        return tags_rows_to_dict(cur.fetchall())
    finally:
        con.close()


def tags_rows_to_dict(rows: List[Tuple[Any, ...]]) -> Dict[str, Dict[str, float]]:
    out: Dict[str, Dict[str, float]] = {}
    for row in rows:
        ch = str(row[0])
        t: Dict[str, float] = {}
        for i, col in enumerate(_FLOAT_COLS):
            v = row[1 + i]
            if v is not None:
                t[col] = float(v)
        if "range_score" in t:
            t["range"] = t["range_score"]
        out[ch] = t
    return out


def load_tags_from_json(path: Path) -> Dict[str, Dict[str, float]]:
    with open(path, encoding="utf-8") as f:
        raw: Dict[str, Any] = json.load(f)
    out: Dict[str, Dict[str, float]] = {}
    for ch, t in raw.items():
        if not isinstance(t, dict):
            continue
        d = {k: float(v) for k, v in t.items() if isinstance(v, (int, float))}
        if "range_score" in d and "range" not in d:
            d["range"] = d["range_score"]
        out[str(ch)] = d
    return out


def load_dictionaries(
    db: Path, tags: Optional[Path] = None
) -> Tuple[
    Dict[Tuple[Any, ...], float],
    Dict[Tuple[Any, ...], float],
    Dict[Tuple[Any, ...], float],
    Dict[Tuple[Any, ...], float],
    Dict[str, Dict[str, float]],
]:
    base = load_baseline_row(db)
    matchup = load_matchup_rows(db)
    synergy = load_synergy_rows(db)
    comfort = load_comfort_rows(db)
    if tags and tags.is_file():
        tmap = load_tags_from_json(tags)
    else:
        tmap = load_tags_from_db(db)
    return base, matchup, synergy, comfort, tmap


def make_scorer(
    db: Path, champ_pool: List[str], tags: Optional[Path] = None
) -> DraftScorer:
    b, m, s, c, t = load_dictionaries(db, tags=tags)
    return DraftScorer(
        base=b, matchup=m, synergy=s, comfort=c, tags=t, champ_pool=champ_pool
    )
