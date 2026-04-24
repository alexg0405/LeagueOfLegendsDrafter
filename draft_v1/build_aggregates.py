"""
Offline: read matches + participants (and optional bans) -> fill champ_baseline, champ_matchup, champ_synergy.
Optional: import champ_tags and player_comfort from JSON/CSV.

**Not the canonical Riot training path.** For production, use training/etl/ingest.py +
training/etl/aggregate_effects.py and training/export_effects.py. Keep this file as a
small, literal baseline/matchup/synergy implementation for the draft_v1 oracle.

  python -m draft_v1.build_aggregates --db draft_v1/data/stats.db --init-schema
  python -m draft_v1.build_aggregates --db draft_v1/data/stats.db --seed-sample
  python -m draft_v1.build_aggregates --db path/to/historical.db
"""

from __future__ import annotations

import argparse
import csv
import json
import sqlite3
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


def _smoothed_rate(wins: int, games: int, prior: float = 0.50, k: int = 200) -> float:
    if games < 0:
        raise ValueError("games")
    if games == 0:
        return prior
    return (wins + k * prior) / (games + k)


def _init_schema(db: Path) -> None:
    import draft_v1

    pkg = Path(draft_v1.__file__).resolve().parent
    schema = (pkg / "schema.sql").read_text(encoding="utf-8")
    con = sqlite3.connect(str(db))
    try:
        con.executescript(schema)
        con.commit()
    finally:
        con.close()


def _clear_effect_tables(con: sqlite3.Connection) -> None:
    for t in ("champ_baseline", "champ_matchup", "champ_synergy"):
        con.execute(f"DELETE FROM {t}")


def _aggregate_baseline(
    con: sqlite3.Connection, k: int, prior: float
) -> None:
    """baseline score = sm(champ) - sm(role) within (patch, queue, tier, role)."""
    con.execute("DELETE FROM champ_baseline")
    rows: List[Tuple[str, str, str, str, str, int, int, float]] = []

    for patch, queue, tier, role in con.execute(
        "SELECT DISTINCT m.patch, m.queue, m.tier, p.role "
        "FROM participants p JOIN matches m ON m.match_id = p.match_id"
    ):
        w_role, g_role = 0, 0
        for w, g in con.execute(
            "SELECT p.win, 1 FROM participants p "
            "JOIN matches m ON m.match_id = p.match_id "
            "WHERE m.patch = ? AND m.queue = ? AND m.tier = ? AND p.role = ?",
            (patch, queue, tier, role),
        ):
            w_role += w
            g_role += g
        if g_role == 0:
            continue
        sm_role = _smoothed_rate(w_role, g_role, prior, k)

        for champ, c_w, c_g in con.execute(
            "SELECT p.champ, SUM(p.win), COUNT(*) FROM participants p "
            "JOIN matches m ON m.match_id = p.match_id "
            "WHERE m.patch = ? AND m.queue = ? AND m.tier = ? AND p.role = ? "
            "GROUP BY p.champ",
            (patch, queue, tier, role),
        ):
            if c_g < 1:
                continue
            sm = _smoothed_rate(c_w, c_g, prior, k) - sm_role
            rows.append(
                (str(patch), str(queue), str(tier), str(role), str(champ), c_g, c_w, sm)
            )
    con.executemany(
        "INSERT INTO champ_baseline (patch, queue, tier, role, champ, games, wins, score) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        rows,
    )


def _aggregate_matchup_synergy(
    con: sqlite3.Connection, k: int, prior: float, min_games: int
) -> None:
    con.execute("DELETE FROM champ_matchup")
    con.execute("DELETE FROM champ_synergy")
    m_rows: List[Tuple[str, str, str, str, str, str, str, int, float]] = []
    s_rows: List[Tuple[str, str, str, str, str, str, str, int, float]] = []

    matchup: Dict[Tuple[str, str, str, str, str, str, str, str], List[int]] = {}
    syn: Dict[Tuple[str, str, str, str, str, str, str, str], List[int]] = {}

    for match_id, patch, queue, tier in con.execute("SELECT match_id, patch, queue, tier FROM matches"):
        pids: Dict[str, List[Tuple[str, str, int]]] = {"blue": [], "red": []}
        for side, role, ch, win in con.execute(
            "SELECT side, role, champ, win FROM participants WHERE match_id = ?",
            (match_id,),
        ):
            pids[str(side)].append((str(role), str(ch), int(win)))
        wblue = pids["blue"][0][2] if pids["blue"] else 0
        wred = 1 - wblue
        w_by_side = {"blue": wblue, "red": wred}

        for a in pids["blue"]:
            for b in pids["red"]:
                w = wblue
                r1, c1, _ = a
                r2, c2, _ = b
                key1 = (patch, queue, tier, r1, c1, r2, c2)
                if key1 not in matchup:
                    matchup[key1] = [0, 0]
                matchup[key1][0] += w
                matchup[key1][1] += 1

        for a in pids["red"]:
            for b in pids["blue"]:
                w = wred
                r1, c1, _ = a
                r2, c2, _ = b
                key1 = (patch, queue, tier, r1, c1, r2, c2)
                if key1 not in matchup:
                    matchup[key1] = [0, 0]
                matchup[key1][0] += w
                matchup[key1][1] += 1

        for side in ("blue", "red"):
            team = pids[side]
            wteam = w_by_side[side]
            for a in team:
                for b in team:
                    if a is b:
                        continue
                    r1, c1, _ = a
                    r2, c2, _ = b
                    key1 = (patch, queue, tier, r1, c1, r2, c2)
                    if key1 not in syn:
                        syn[key1] = [0, 0]
                    syn[key1][0] += wteam
                    syn[key1][1] += 1

    for krow, w_g in matchup.items():
        w, g = w_g[0], w_g[1]
        if g < min_games:
            continue
        sm = _smoothed_rate(w, g, prior, k) - 0.5
        p, q, t, r, c, er, ec = krow
        m_rows.append((p, q, t, r, c, er, ec, g, sm))

    for krow, w_g in syn.items():
        w, g = w_g[0], w_g[1]
        if g < min_games:
            continue
        sm = _smoothed_rate(w, g, prior, k) - 0.5
        p, q, t, r, c, ar, ac = krow
        s_rows.append((p, q, t, r, c, ar, ac, g, sm))

    con.executemany(
        "INSERT INTO champ_matchup (patch, queue, tier, role, champ, enemy_role, enemy_champ, games, score) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        m_rows,
    )
    con.executemany(
        "INSERT INTO champ_synergy (patch, queue, tier, role, champ, ally_role, ally_champ, games, score) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        s_rows,
    )


def _import_champ_tags(con: sqlite3.Connection, path: Path) -> None:
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    rows: List[Tuple[Any, ...]] = []
    for ch, t in data.items():
        if not isinstance(t, dict):
            continue
        r = t.get("range_score", t.get("range"))
        rows.append(
            (
                str(ch),
                t.get("frontline"),
                t.get("engage"),
                t.get("peel"),
                t.get("magic"),
                t.get("physical"),
                r,
                t.get("scaling"),
                t.get("cc"),
            )
        )
    con.execute("DELETE FROM champ_tags")
    con.executemany(
        "INSERT INTO champ_tags (champ, frontline, engage, peel, magic, physical, range_score, scaling, cc) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        rows,
    )


def _import_comfort_csv(con: sqlite3.Connection, path: Path) -> None:
    con.execute("DELETE FROM player_comfort")
    rows: List[Tuple[str, str, int, int, float]] = []
    with open(path, newline="", encoding="utf-8") as f:
        r = csv.DictReader(f)
        for row in r:
            role = str(row.get("role", "")).strip()
            ch = str(row.get("champ", "")).strip()
            g = int(row.get("games", 0) or 0)
            w = int(row.get("wins", 0) or 0)
            sc = float(row.get("score", 0) or 0)
            if role and ch and g > 0:
                rows.append((role, ch, g, w, sc))
    if rows:
        con.executemany(
            "INSERT INTO player_comfort (role, champ, games, wins, score) VALUES (?, ?, ?, ?, ?)",
            rows,
        )


def seed_sample_data(con: sqlite3.Connection) -> None:
    con.execute("DELETE FROM bans")
    con.execute("DELETE FROM participants")
    con.execute("DELETE FROM matches")
    mid = "sample_m1"
    con.execute(
        "INSERT INTO matches (match_id, patch, queue, tier, region, blue_win) VALUES (?,?,?,?,?,?)",
        (mid, "16.8", "ranked_solo", "emerald_plus", "na1", 1),
    )
    for side, r, c, w in [
        ("blue", "top", "Aatrox", 1),
        ("blue", "jungle", "Viego", 1),
        ("blue", "mid", "Orianna", 1),
        ("blue", "adc", "Jinx", 1),
        ("blue", "support", "Thresh", 1),
        ("red", "top", "Malphite", 0),
        ("red", "jungle", "LeeSin", 0),
        ("red", "mid", "Taliyah", 0),
        ("red", "adc", "Caitlyn", 0),
        ("red", "support", "Rell", 0),
    ]:
        con.execute(
            "INSERT INTO participants (match_id, side, role, champ, win) VALUES (?,?,?,?,?)",
            (mid, side, r, c, w),
        )


def rebuild_aggregates(
    db: Path,
    *,
    k: int = 200,
    prior: float = 0.5,
    min_games: int = 1,
    comfort_csv: Optional[Path] = None,
    tags_json: Optional[Path] = None,
) -> None:
    con = sqlite3.connect(str(db))
    try:
        _clear_effect_tables(con)
        _aggregate_baseline(con, k, prior)
        _aggregate_matchup_synergy(con, k, prior, min_games)
        if comfort_csv and comfort_csv.is_file():
            _import_comfort_csv(con, comfort_csv)
        if tags_json and tags_json.is_file():
            _import_champ_tags(con, tags_json)
        con.commit()
    finally:
        con.close()


def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--db", type=Path, default=Path("draft_v1/data/stats.db"))
    ap.add_argument("--init-schema", action="store_true")
    ap.add_argument("--seed-sample", action="store_true", help="insert one SR match; run with --rebuild")
    ap.add_argument("--rebuild", action="store_true", help="recompute effect tables from raw")
    ap.add_argument("--k", type=int, default=200)
    ap.add_argument("--prior", type=float, default=0.5)
    ap.add_argument("--min-games", type=int, default=1, help="matchup/synergy cells with fewer games are dropped")
    ap.add_argument("--tags-json", type=Path, default=None, help="optional: load champ_tags and overwrite")
    ap.add_argument("--comfort-csv", type=Path, default=None, help="optional columns: role,champ,games,wins,score")
    args = ap.parse_args(argv)
    args.db.parent.mkdir(parents=True, exist_ok=True)

    if not args.db.is_file() or args.init_schema:
        _init_schema(args.db)
    if args.seed_sample:
        con = sqlite3.connect(str(args.db))
        try:
            seed_sample_data(con)
            con.commit()
        finally:
            con.close()
    if args.rebuild:
        tj = args.tags_json
        if tj is None:
            pkg = Path(__file__).resolve().parent / "data" / "champ_tags.json"
            if pkg.is_file():
                tj = pkg
        rebuild_aggregates(
            args.db,
            k=args.k,
            prior=args.prior,
            min_games=args.min_games,
            comfort_csv=args.comfort_csv,
            tags_json=tj,
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())