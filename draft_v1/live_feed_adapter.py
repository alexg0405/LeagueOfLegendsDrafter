"""
Normalize the overlay / vision output into the single DraftState dict the scorer expects.

- JSON: use a *list* for bans (e.g. ["Draven", "Kalista"]). Sets are not JSON-serializable.
- Roles: top, jungle, mid, adc, support
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, Iterable, List, MutableMapping, Set, Union

from .scorer import DraftState

_ROLE_ALIASES = {
    "top": "top",
    "toplane": "top",
    "jungle": "jungle",
    "jg": "jungle",
    "jun": "jungle",
    "mid": "mid",
    "middle": "mid",
    "adc": "adc",
    "bottom": "adc",
    "bot": "adc",
    "support": "support",
    "supp": "support",
    "utility": "support",
}


def _norm_role(r: str) -> str:
    k = (r or "").strip().lower()
    return _ROLE_ALIASES.get(k, k)


def to_state(
    patch: str,
    queue: str,
    tier: str,
    my_role: str,
    ally_locked: MutableMapping[str, str],
    enemy_locked: MutableMapping[str, str],
    bans: Union[Iterable[str], Set[str], None] = None,
) -> DraftState:
    a: Dict[str, str] = {
        _norm_role(rl): str(ch) for rl, ch in (ally_locked or {}).items() if ch
    }
    e: Dict[str, str] = {
        _norm_role(rl): str(ch) for rl, ch in (enemy_locked or {}).items() if ch
    }
    b = bans
    if b is None:
        bl: List[str] = []
    elif isinstance(b, (set, frozenset)):
        bl = [str(x) for x in b]
    else:
        bl = [str(x) for x in b]
    st: DraftState = {
        "patch": str(patch).strip(),
        "queue": str(queue).strip(),
        "tier": str(tier).strip(),
        "my_role": _norm_role(str(my_role)),
        "ally_locked": a,
        "enemy_locked": e,
        "bans": bl,
    }
    return st


def from_json_file(path: Path) -> DraftState:
    with open(path, encoding="utf-8") as f:
        raw: Dict[str, Any] = json.load(f)
    return from_loose_dict(raw)


def from_loose_dict(d: Dict[str, Any]) -> DraftState:
    return to_state(
        patch=d["patch"],
        queue=d["queue"],
        tier=d["tier"],
        my_role=d["my_role"],
        ally_locked=d.get("ally_locked", {}),
        enemy_locked=d.get("enemy_locked", {}),
        bans=d.get("bans"),
    )
