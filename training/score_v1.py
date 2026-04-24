#!/usr/bin/env python3
"""
First-pass live draft scorer: fast vector-style sum of logit effects + optional MC over random completions.
Train effects offline (from team_row rows) and export JSON/SQLite; this script only consumes them.

Riot: match data from match-v5; ids from Data Dragon. This file has no network calls.

Typical: python training/score_v1.py --state training/examples/live_state.example.json
"""
from __future__ import annotations

import argparse
import json
import math
import random
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

EPS = 1e-6
ROLES = ("top", "jungle", "mid", "adc", "support")

# App uses "bottom" / "adc" interchangeably
ROLE_ALIASES = {
    "bottom": "adc",
    "adc": "adc",
    "bot": "adc",
    "middle": "mid",
    "mid": "mid",
    "utility": "support",
    "support": "support",
    "top": "top",
    "jungle": "jungle",
}


def normalize_role(r: str) -> str:
    k = (r or "").lower().strip()
    return ROLE_ALIASES.get(k, k)


def smoothed_rate(wins: int, games: int, prior: float = 0.5, k: int = 200) -> float:
    if games < 0 or wins < 0 or wins > games:
        raise ValueError("invalid games/wins")
    return (wins + k * prior) / (games + k) if games > 0 else prior


def logit(p: float) -> float:
    p = min(max(p, EPS), 1.0 - EPS)
    return math.log(p / (1.0 - p))


def logit_effect_from_smoothed(w: int, n: int, prior: float = 0.5, k: int = 200) -> float:
    p_hat = smoothed_rate(w, n, prior, k)
    return logit(p_hat) - logit(prior)


def sigmoid(x: float) -> float:
    if x > 30:
        return 1.0
    if x < -30:
        return 0.0
    return 1.0 / (1.0 + math.exp(-x))


def get_nested(
    d: Optional[Dict[str, Any]], keys: Sequence[str], default: float = 0.0
) -> float:
    if not d:
        return default
    cur: Any = d
    for key in keys:
        if not isinstance(cur, dict) or key not in cur:
            return default
        cur = cur[key]
    if isinstance(cur, (int, float)):
        return float(cur)
    return default


@dataclass
class EffectStore:
    """Nested dicts: patch -> queue -> tier -> tables."""

    base: Dict[str, Any] = field(default_factory=dict)
    matchup: Dict[str, Any] = field(default_factory=dict)  # my_role -> enemy_id -> c -> value
    synergy: Dict[str, Any] = field(
        default_factory=dict
    )  # my_role -> ally_role -> c -> a -> value
    comp_fit: Dict[str, Any] = field(default_factory=dict)  # optional scalar adjustments

    @staticmethod
    def from_dir(p: Path) -> "EffectStore":
        def load(name: str) -> Dict[str, Any]:
            fp = p / f"{name}.json"
            if not fp.is_file():
                return {}
            return json.loads(fp.read_text(encoding="utf-8"))

        if not p.is_dir():
            return EffectStore()
        return EffectStore(
            base=load("logit_base"),
            matchup=load("logit_matchup"),
            synergy=load("logit_synergy"),
            comp_fit=load("logit_comp"),
        )


def logit_base(store: EffectStore, patch: str, queue: str, tier: str, role: str, cid: int) -> float:
    r = normalize_role(role)
    return get_nested(
        store.base, [patch, queue, tier, r, str(cid)], 0.0
    ) or get_nested(store.base, [patch, queue, "all", r, str(cid)], 0.0)


def logit_matchup(
    store: EffectStore, patch: str, queue: str, tier: str, my_role: str, c: int, e: int
) -> float:
    mr = normalize_role(my_role)
    # file shape: {patch}{queue}{tier}{my_role}{c}{e}
    v = get_nested(
        store.matchup, [patch, queue, tier, mr, str(c), str(e)], 0.0
    ) or get_nested(store.matchup, [patch, queue, "all", mr, str(c), str(e)], 0.0)
    return v


def logit_synergy(
    store: EffectStore, patch: str, queue: str, tier: str, my_role: str, ar: str, c: int, a: int
) -> float:
    mr, arn = normalize_role(my_role), normalize_role(ar)
    return get_nested(
        store.synergy, [patch, queue, tier, mr, arn, str(c), str(a)], 0.0
    ) or get_nested(
        store.synergy, [patch, queue, "all", mr, arn, str(c), str(a)], 0.0
    )


def fast_v1_logit(
    state: dict,
    c: int,
    store: EffectStore,
) -> float:
    """Sum base + matchups (locked enemies) + synergies (locked allies) + comp_fit hook."""
    patch = str(state.get("patch", "all"))
    queue = str(state.get("queue", "all"))
    tier = str(state.get("tier_bucket", "all"))
    my_role = normalize_role(str(state.get("my_role", "")))
    s = logit_base(store, patch, queue, tier, my_role, c)
    for er, eid in (state.get("enemy_role_picks") or {}).items():
        if not eid:
            continue
        w = 1.0 if normalize_role(er) == my_role else 0.32
        s += w * logit_matchup(store, patch, queue, tier, my_role, c, int(eid))
    for ar, aid in (state.get("ally_role_picks") or {}).items():
        if not aid or normalize_role(ar) == my_role:
            continue
        s += logit_synergy(
            store, patch, queue, tier, my_role, ar, c, int(aid)
        )
    s += get_nested(
        store.comp_fit, [patch, queue, tier, str(c)], 0.0
    )  # hand-tuned or model residual
    return s


def comfort_get(state: dict, c: int) -> float:
    m = state.get("comfort") or {}
    v = m.get(str(c), m.get(c))
    if v is None:
        return 0.0
    return 0.15 * (float(v) - 0.5)  # small logit nudge, centered


def final_score_logit(
    state: dict, c: int, store: EffectStore, include_comfort: bool = True
) -> Tuple[float, float]:
    x = fast_v1_logit(state, c, store) + (comfort_get(state, c) if include_comfort else 0.0)
    return x, sigmoid(x + _bias(state))


def _bias(state: dict) -> float:
    """Model intercept + side. Train later; start near 0."""
    side = (state.get("side") or "").lower()
    return 0.02 if side == "blue" else 0.0  # example only


# --- Optional Monte Carlo (random fills) ---------------------------------

def load_pools(p: Path) -> Dict[str, List[int]]:
    if not p.is_file():
        return {r: [22, 81, 51] for r in ("adc",)}  # tiny stub
    data = json.loads(p.read_text(encoding="utf-8"))
    out: Dict[str, List[int]] = {}
    for r in ROLES:
        out[r] = [int(x) for x in data.get(r, [])]
    return out


def complete_random(
    state: dict, my_pick: int, pools: Dict[str, List[int]], rng: random.Random
) -> Dict[str, Any]:
    """Return full 5+5 id maps (both teams) for win-model or proxy completion."""
    al: Dict[str, int] = {
        normalize_role(k): int(v) for k, v in (state.get("ally_role_picks") or {}).items() if v
    }
    en: Dict[str, int] = {
        normalize_role(k): int(v) for k, v in (state.get("enemy_role_picks") or {}).items() if v
    }
    mr = normalize_role(str(state.get("my_role", "")))
    al[mr] = my_pick
    used = set(int(x) for x in (state.get("bans") or []))
    used |= set(al.values()) | set(en.values())

    def fill(side: Dict[str, int]) -> None:
        for r in ROLES:
            if r in side and side[r] > 0:
                continue
            pool = [c for c in pools.get(r, []) if c not in used]
            if not pool:
                continue
            choice = int(rng.choice(pool))
            side[r] = choice
            used.add(choice)

    fill(al)
    fill(en)
    return {
        "ally": al,
        "enemy": en,
        "patch": state.get("patch"),
        "queue": state.get("queue"),
        "tier_bucket": state.get("tier_bucket", "all"),
        "side": state.get("side"),
    }


def full_draft_logit(
    full: dict, store: EffectStore, my_team_is_blue: bool
) -> float:
    """
    Placeholder: proxy win logit = sum of mean base(ally) - mean base(enemy) + interactions.
    Replace with your trained P(win) from featurize(full) -> model.
    """
    patch, queue, tier = str(full.get("patch")), str(full.get("queue")), str(
        full.get("tier_bucket", "all")
    )
    aly = full.get("ally") or {}
    ene = full.get("enemy") or {}
    t = 0.0
    for r, cid in aly.items():
        t += logit_base(store, patch, queue, tier, r, int(cid)) * 0.1
    for r, cid in ene.items():
        t -= logit_base(store, patch, queue, tier, r, int(cid)) * 0.1
    t += 0.02 if (full.get("side") == "blue") and my_team_is_blue else 0.0
    return t


def monte_carlo(
    state: dict,
    candidates: Sequence[int],
    store: EffectStore,
    pools: Dict[str, List[int]],
    n: int,
    seed: int,
) -> List[Tuple[int, float, float, float]]:
    """Returns (c, mean_p_proxy, stdev, mean_logit) using placeholder full_draft_logit."""
    rng = random.Random(seed)
    out: List[Tuple[int, float, float, float]] = []
    for c in candidates:
        vals: List[float] = []
        lts: List[float] = []
        for _ in range(n):
            full = complete_random(state, c, pools, rng)
            # assume state.side is "our" team
            lt = full_draft_logit(full, store, (state.get("side") or "").lower() == "blue")
            lts.append(lt)
            vals.append(sigmoid(lt))
        mean = sum(vals) / max(len(vals), 1)
        var = sum((v - mean) ** 2 for v in vals) / max(len(vals), 1)
        mlt = sum(lts) / max(len(lts), 1)
        out.append((c, mean, math.sqrt(var), mlt))
    return sorted(out, key=lambda t: t[1], reverse=True)


# --- CLI -----------------------------------------------------------------


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--state", type=Path, help="Path to live_state json")
    ap.add_argument(
        "--effects",
        type=Path,
        default=None,
        help="Directory with logit_base.json, logit_matchup.json, logit_synergy.json",
    )
    ap.add_argument("--pools", type=Path, help="JSON role->[championId] for MC")
    ap.add_argument("--top", type=int, default=5)
    args = ap.parse_args()
    if not args.state or not args.state.is_file():
        print("Pass --state path/to/live_state.json", file=sys.stderr)
        return 1
    st = json.loads(args.state.read_text(encoding="utf-8"))
    eff_dir = args.effects
    if eff_dir is None:
        eff_dir = Path(__file__).parent / "examples" / "effects"
    store = EffectStore.from_dir(eff_dir)
    candidates = st.get("candidates") or []
    n_mc = int(st.get("n_monte_carlo", 0) or 0)
    pools = load_pools(args.pools) if args.pools else load_pools(
        Path(__file__).parent / "data" / "role_pools.min.json"
    )

    print("## Fast v1 (per candidate logit sum -> sigmoid proxy)")
    rows: List[Tuple[int, float, float]] = []
    for c in candidates:
        lg, p = final_score_logit(st, c, store)
        rows.append((c, p, lg))
    rows.sort(key=lambda x: x[1], reverse=True)
    for c, p, lg in rows[: args.top]:
        print(f"  {c:4d}  p_proxy={p:.4f}  logit={lg:+.3f}")
    if n_mc > 0 and candidates:
        print(f"\n## Monte Carlo n={n_mc} (replace full_draft_logit with your trained model)")
        for c, m, s, mlt in monte_carlo(
            st, candidates, store, pools, n_mc, 0xC0FFEE
        )[: args.top]:
            print(f"  {c:4d}  mean_p={m:.4f}  stdev={s:.4f}  mean_logit={mlt:+.3f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
