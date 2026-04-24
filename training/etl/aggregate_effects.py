#!/usr/bin/env python3
"""
Read team_perspective from SQLite, aggregate win counts, write logit_*.json for training/score_v1.py

Usage:
  python training/etl/aggregate_effects.py --db training/nexus_training.db --out training/examples/effects
"""
from __future__ import annotations

import argparse
import json
import math
import sqlite3
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any, DefaultDict, Dict, Tuple

EPS = 1e-6
ROLES = ("top", "jungle", "mid", "adc", "support")


def logit(p: float) -> float:
    p = min(max(p, EPS), 1.0 - EPS)
    return math.log(p / (1.0 - p))


def smoothed_effect(wins: int, games: int, prior: float, k: int) -> float:
    if games <= 0:
        return 0.0
    p_hat = (wins + k * prior) / (games + k)
    return logit(p_hat) - logit(prior)


def nest_set(
    root: Dict[str, Any], keys: Tuple[str, ...], leaf_key: str, value: float
) -> None:
    cur: Any = root
    for k in keys:
        if k not in cur or not isinstance(cur[k], dict):
            cur[k] = {}
        cur = cur[k]
    cur[leaf_key] = value


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", type=Path, default=Path("training/nexus_training.db"))
    ap.add_argument("--out", type=Path, default=Path("training/examples/effects"))
    ap.add_argument("--k", type=int, default=200)
    ap.add_argument("--prior", type=float, default=0.5)
    ap.add_argument("--min-games-base", type=int, default=15)
    ap.add_argument("--min-games-mu", type=int, default=8)
    ap.add_argument("--min-games-syn", type=int, default=5)
    args = ap.parse_args()

    if not args.db.is_file():
        print("DB not found:", args.db, file=sys.stderr)
        return 1

    conn = sqlite3.connect(str(args.db))
    conn.row_factory = sqlite3.Row
    cur = conn.execute(
        "SELECT patch_bucket, queue_bucket, COALESCE(tier_bucket, 'all') as tb, won,"
        " role_picks_json, enemy_role_picks_json FROM team_perspective"
    )

    # (patch, queue, tier, role, cid) -> (w, g)
    base: DefaultDict[Tuple, Tuple[int, int]] = defaultdict(lambda: (0, 0))
    # (patch, queue, tier, my_role, c, e) -> (w, g)  lane opponent
    mu: DefaultDict[Tuple, Tuple[int, int]] = defaultdict(lambda: (0, 0))
    # (patch, queue, tier, my_role, ar, c, a) -> (w, g)
    syn: DefaultDict[Tuple, Tuple[int, int]] = defaultdict(lambda: (0, 0))

    n_rows = 0
    for row in cur:
        n_rows += 1
        patch = str(row["patch_bucket"])
        qb = str(row["queue_bucket"])
        tb = str(row["tb"])
        won = int(row["won"])
        ally: Dict[str, int] = json.loads(row["role_picks_json"])
        enemy: Dict[str, int] = json.loads(row["enemy_role_picks_json"])

        for r, cid in ally.items():
            if r not in ROLES or not isinstance(cid, int) or cid <= 0:
                continue
            w, g = base[(patch, qb, tb, r, cid)]
            base[(patch, qb, tb, r, cid)] = (w + won, g + 1)

        for mr in ROLES:
            c = ally.get(mr)
            e = enemy.get(mr)
            if not c or not e:
                continue
            t = (patch, qb, tb, mr, c, e)
            w, g = mu[t]
            mu[t] = (w + won, g + 1)

        for my_r in ROLES:
            c0 = ally.get(my_r)
            if not c0:
                continue
            for ar in ROLES:
                if ar == my_r:
                    continue
                a0 = ally.get(ar)
                if not a0:
                    continue
                t = (patch, qb, tb, my_r, ar, c0, a0)
                w, g = syn[t]
                syn[t] = (w + won, g + 1)

    conn.close()
    print("rows scanned:", n_rows, file=sys.stderr)
    if n_rows == 0:
        print("no team_perspective data; run ingest first", file=sys.stderr)
        return 1

    out_dir = args.out
    out_dir.mkdir(parents=True, exist_ok=True)

    base_json: Dict[str, Any] = {}
    for (patch, qb, tb, r, cid), (w, g) in base.items():
        if g < args.min_games_base:
            continue
        eff = smoothed_effect(w, g, args.prior, args.k)
        nest_set(
            base_json, (patch, qb, tb, r), str(int(cid)), round(eff, 5)
        )

    mu_json: Dict[str, Any] = {}
    for (patch, qb, tb, my_r, c, e), (w, g) in mu.items():
        if g < args.min_games_mu:
            continue
        eff = round(smoothed_effect(w, g, args.prior, args.k), 5)
        d = mu_json
        for k in (patch, qb, tb, my_r):
            d = d.setdefault(k, {})
        d.setdefault(str(int(c)), {})[str(int(e))] = eff

    syn_json: Dict[str, Any] = {}
    for (patch, qb, tb, my_r, ar, c, a), (w, g) in syn.items():
        if g < args.min_games_syn:
            continue
        eff = round(smoothed_effect(w, g, args.prior, args.k), 5)
        d = syn_json
        for k in (patch, qb, tb, my_r, ar, str(int(c))):
            d = d.setdefault(k, {})
        d[str(int(a))] = eff

    (out_dir / "logit_base.json").write_text(
        json.dumps(base_json, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    (out_dir / "logit_matchup.json").write_text(
        json.dumps(mu_json, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    (out_dir / "logit_synergy.json").write_text(
        json.dumps(syn_json, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    (out_dir / "logit_comp.json").write_text("{}\n", encoding="utf-8")
    print("wrote", out_dir, file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
