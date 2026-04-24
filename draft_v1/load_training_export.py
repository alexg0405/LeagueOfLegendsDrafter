"""
Load training/export_effects `training_export_name.json` into draft_v1.DraftScorer dicts.

Canonical pipeline: match-v5 -> training/etl -> logit_*.json -> training/export_effects.py
-> this file (name-keyed tuples for the literal scorer oracle).

State for parity must use **champion display names** matching champion_dim / export, not raw ids.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Tuple

from .scorer import DraftScorer

TupleFloatMap = Dict[Tuple[Any, ...], float]


def _flatten_base(d: Any, pfx: Tuple[str, ...], out: TupleFloatMap) -> None:
    if not isinstance(d, dict) or not d:
        return
    for k, v in d.items():
        if (
            len(pfx) == 3
            and isinstance(v, dict)
            and v
            and all(isinstance(x, (int, float)) for x in v.values())
        ):
            for cname, sc in v.items():
                out[pfx + (str(k), str(cname))] = float(sc)
        elif isinstance(v, dict):
            _flatten_base(v, pfx + (str(k),), out)


def _flatten_matchup(d: Any, pfx: Tuple[str, ...], out: TupleFloatMap) -> None:
    if not isinstance(d, dict) or not d:
        return
    if len(pfx) == 4:
        mr = pfx[3]
        for c, inner in d.items():
            if (
                isinstance(inner, dict)
                and inner
                and all(isinstance(x, (int, float)) for x in inner.values())
            ):
                for e, sc in inner.items():
                    out[pfx + (str(c), str(mr), str(e))] = float(sc)
        return
    for k, v in d.items():
        if isinstance(v, dict):
            _flatten_matchup(v, pfx + (str(k),), out)


def _flatten_synergy(d: Any, pfx: Tuple[str, ...], out: TupleFloatMap) -> None:
    if not isinstance(d, dict) or not d:
        return
    if len(pfx) == 4:
        for ar, cblock in d.items():
            if not isinstance(cblock, dict):
                continue
            for c, inner in cblock.items():
                if not isinstance(inner, dict) or not inner:
                    continue
                if not all(
                    isinstance(x, (int, float)) for x in inner.values()
                ):
                    continue
                for a, sc in inner.items():
                    out[pfx + (str(ar), str(c), str(a))] = float(sc)
        return
    for k, v in d.items():
        if isinstance(v, dict):
            _flatten_synergy(v, pfx + (str(k),), out)


def load_tuple_dicts_from_export_json(j: dict) -> Tuple[TupleFloatMap, TupleFloatMap, TupleFloatMap]:
    base: TupleFloatMap = {}
    _flatten_base(j.get("logit_base") or {}, tuple(), base)

    mu: TupleFloatMap = {}
    _flatten_matchup(j.get("logit_matchup") or {}, tuple(), mu)

    syn: TupleFloatMap = {}
    _flatten_synergy(j.get("logit_synergy") or {}, tuple(), syn)
    return base, mu, syn


def load_draft_scorer_from_export(
    path: Path,
    champ_pool: List[str],
    comfort: TupleFloatMap | None = None,
    tags: Dict[str, Dict[str, float]] | None = None,
) -> DraftScorer:
    j = json.loads(path.read_text(encoding="utf-8"))
    base, m, s = load_tuple_dicts_from_export_json(j)
    c = comfort or {}
    t = tags or {}
    return DraftScorer(
        base=base, matchup=m, synergy=s, comfort=c, tags=t, champ_pool=champ_pool
    )
