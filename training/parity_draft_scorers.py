#!/usr/bin/env python3
"""
Compare per-candidate rankings across:
- training/score_v1 (logit effects from training/examples/effects, optional comfort)
- draft_v1/scorer (name-keyed logit from draft_v1/data/training_export_name.json, if present)

The TypeScript v1 recommender is not invoked here; run `npm test` and inspect
`src/shared/draft/parityFixture.test.ts` snapshot for the same fixture (heuristic model).

  python -m training.parity_draft_scorers
  python -m training.parity_draft_scorers --state training/examples/parity_state.json
"""
from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# repo root: training/ -> parent
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from training.score_v1 import EffectStore, final_score_logit  # noqa: E402
from draft_v1.live_feed_adapter import to_state  # noqa: E402
from draft_v1.load_training_export import load_draft_scorer_from_export  # noqa: E402


def _load_id_names(db: Path) -> Dict[int, str]:
    out: Dict[int, str] = {}
    if not db.is_file():
        return out
    con = sqlite3.connect(str(db))
    try:
        for cid, name, _ in con.execute(
            "SELECT champion_id, champion_name, normalized_name FROM champion_dim"
        ):
            if cid and name:
                out[int(cid)] = str(name)
    except sqlite3.OperationalError:
        pass
    finally:
        con.close()
    return out


def _comfort_draft_tuples(
    my_role: str, comfort: Optional[dict], id_to_name: Dict[int, str]
) -> Dict[Tuple[str, ...], float]:
    """Align with draft_v1: store small additive terms; use same nudge as score_v1 for parity."""
    out: Dict[Tuple[str, ...], float] = {}
    if not comfort:
        return out
    for k, v in comfort.items():
        try:
            cid = int(k)
        except (TypeError, ValueError):
            continue
        name = id_to_name.get(cid)
        if not name:
            continue
        vf = float(v)
        nudge = 0.15 * (vf - 0.5)  # score_v1.comfort_get
        out[(my_role, name)] = nudge
    return out


def run(
    state_path: Path,
    effects_dir: Path,
    db: Path,
    name_export: Path,
    top: int,
) -> int:
    st = json.loads(state_path.read_text(encoding="utf-8"))
    candidates: List[int] = [int(x) for x in (st.get("candidates") or [])]
    if not candidates:
        print("no candidates in state", file=sys.stderr)
        return 1

    store = EffectStore.from_dir(effects_dir)
    py_rows: List[Tuple[int, float, float]] = []
    for c in candidates:
        lg, p = final_score_logit(st, c, store)
        py_rows.append((c, p, lg))
    py_rows.sort(key=lambda t: t[1], reverse=True)
    id_to_name = _load_id_names(db)
    if not id_to_name:
        print(
            "champion_dim empty: draft_v1 name path skipped. "
            "Run: npm run train:champion-dim  then npm run train:export",
            file=sys.stderr,
        )

    draft_order: List[Tuple[str, float, int]] = []
    if name_export.is_file() and id_to_name:
        mr = str(st.get("my_role", "adc"))
        ally, enemy = {}, {}
        for r, v in (st.get("ally_role_picks") or {}).items():
            n = id_to_name.get(int(v)) if v is not None else None
            if n:
                ally[str(r)] = n
        for r, v in (st.get("enemy_role_picks") or {}).items():
            n = id_to_name.get(int(v)) if v is not None else None
            if n:
                enemy[str(r)] = n
        ds = to_state(
            str(st.get("patch", "16.8")),
            str(st.get("queue", "ranked_solo")),
            str(st.get("tier_bucket", "all")),
            mr,
            ally,
            enemy,
            st.get("bans") or [],
        )
        comfort = _comfort_draft_tuples(mr, st.get("comfort") or {}, id_to_name)
        names = [id_to_name[c] for c in candidates if c in id_to_name]
        if len(names) != len(candidates):
            print("warning: some candidate ids lack champion_dim name", file=sys.stderr)
        ch_pool = [id_to_name.get(c) or f"id:{c}" for c in candidates]
        scorer = load_draft_scorer_from_export(
            name_export, ch_pool, comfort=comfort
        )
        for c in candidates:
            n = id_to_name.get(c) or f"id:{c}"
            s, _ = scorer.score_candidate(n, ds)
            draft_order.append((n, s, c))
        draft_order.sort(key=lambda t: t[1], reverse=True)
    else:
        draft_order = []

    print("## training/score_v1 (logit + sigmoid proxy p)")
    for t in py_rows[:top]:
        print(f"  id={t[0]:4d}  p_proxy={t[1]:.4f}  logit={t[2]:+.4f}")
    if draft_order:
        print("\n## draft_v1 (additive name export; scale differs from p_proxy)")
        for n, s, cid in draft_order[:top]:
            print(f"  id={cid:4d}  name={n:20s}  score={s:+.4f}")
    else:
        print("\n## draft_v1: skipped (see warning above)")

    print("\n## rank by candidate id (1 = best)")
    hdr = f"  {'id':>5}  {'py_rank':>8}"
    if draft_order:
        hdr += f"  {'draft_rank':>10}"
    print(hdr)
    for c in candidates:
        pr = next((i + 1 for i, t in enumerate(py_rows) if t[0] == c), -1)
        line = f"  {c:5d}  {pr:8d}"
        if draft_order:
            dr = next((i + 1 for i, t in enumerate(draft_order) if t[2] == c), -1)
            line += f"  {dr:10d}"
        print(line)

    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--state", type=Path, default=ROOT / "training/examples/parity_state.json")
    ap.add_argument(
        "--effects",
        type=Path,
        default=ROOT / "training/examples/effects",
    )
    ap.add_argument("--db", type=Path, default=ROOT / "training/nexus_training.db")
    ap.add_argument(
        "--name-export",
        type=Path,
        default=ROOT / "draft_v1/data/training_export_name.json",
    )
    ap.add_argument("--top", type=int, default=8)
    args = ap.parse_args()
    return run(args.state, args.effects, args.db, args.name_export, args.top)


if __name__ == "__main__":
    raise SystemExit(main())
