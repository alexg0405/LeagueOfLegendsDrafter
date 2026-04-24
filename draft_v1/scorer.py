from __future__ import annotations

from typing import Any, Dict, Hashable, List, Mapping, MutableMapping, Sequence, Tuple

# In-memory shape the live feed must converge to. Use JSON: bans as a list, not a set.
DraftState = MutableMapping[str, Any]


def _bans_set(state: DraftState) -> set[str]:
    b = state.get("bans", ())
    if isinstance(b, (set, frozenset)):
        return set(b)
    return {str(x) for x in b}


class DraftScorer:
    def __init__(
        self,
        base: Dict[Tuple[Hashable, ...], float],
        matchup: Dict[Tuple[Hashable, ...], float],
        synergy: Dict[Tuple[Hashable, ...], float],
        comfort: Dict[Tuple[Hashable, ...], float],
        tags: Dict[str, Dict[str, float]],
        champ_pool: Sequence[str],
    ):
        self.base = base
        self.matchup = matchup
        self.synergy = synergy
        self.comfort = comfort
        self.tags = tags
        self.champ_pool = tuple(champ_pool)

    def legal_candidates(self, state: DraftState) -> List[str]:
        taken: set[str] = set()
        for m in (state.get("ally_locked"), state.get("enemy_locked")):
            if not isinstance(m, Mapping):
                continue
            for v in m.values():
                if v:
                    taken.add(str(v))
        taken |= _bans_set(state)
        return [c for c in self.champ_pool if c not in taken]

    def comp_adjustment(self, champ: str, state: DraftState) -> float:
        def tag(name: str, c: str, key: str) -> float:
            t = self.tags.get(c) or {}
            v = t.get(key)
            if v is not None:
                return float(v)
            return 0.0

        score = 0.0
        ally = state.get("ally_locked") or {}
        enemy = state.get("enemy_locked") or {}
        if not isinstance(ally, Mapping) or not isinstance(enemy, Mapping):
            return 0.0

        ally_team = list(ally.values()) + [champ]
        enemy_team = list(enemy.values())

        ally_frontline = sum(tag("a", c, "frontline") for c in ally_team)
        ally_magic = sum(tag("a", c, "magic") for c in ally_team)
        enemy_engage = sum(tag("e", c, "engage") for c in enemy_team)

        if ally_frontline < 1.0 and tag("c", champ, "frontline") > 0.6:
            score += 0.03

        if ally_magic < 0.8 and tag("c", champ, "magic") > 0.6:
            score += 0.02

        if enemy_engage > 1.2 and tag("c", champ, "peel") > 0.5:
            score += 0.02

        return score

    def score_candidate(self, champ: str, state: DraftState) -> Tuple[float, List[Tuple[str, float]]]:
        patch = str(state["patch"])
        queue = str(state["queue"])
        tier = str(state["tier"])
        my_role = str(state["my_role"])

        bkey = (patch, queue, tier, my_role, champ)
        score = float(self.base.get(bkey, 0.0))
        reasons: List[Tuple[str, float]] = [("baseline", score)]

        ally_locked = state.get("ally_locked")
        if isinstance(ally_locked, Mapping):
            for ally_role, ally_champ in ally_locked.items():
                if str(ally_role) == my_role:
                    continue
                if not ally_champ:
                    continue
                sk = (patch, queue, tier, my_role, champ, str(ally_role), str(ally_champ))
                v = float(self.synergy.get(sk, 0.0))
                score += v
                reasons.append((f"with {ally_role}:{ally_champ}", v))

        enemy_locked = state.get("enemy_locked")
        if isinstance(enemy_locked, Mapping):
            for enemy_role, enemy_champ in enemy_locked.items():
                if not enemy_champ:
                    continue
                mk = (patch, queue, tier, my_role, champ, str(enemy_role), str(enemy_champ))
                v = float(self.matchup.get(mk, 0.0))
                score += v
                reasons.append((f"into {enemy_role}:{enemy_champ}", v))

        ck = (my_role, champ)
        v = float(self.comfort.get(ck, 0.0))
        score += v
        reasons.append(("comfort", v))

        v = self.comp_adjustment(champ, state)
        score += v
        reasons.append(("comp", v))

        reasons = sorted(reasons, key=lambda x: abs(x[1]), reverse=True)
        return score, reasons[:4]

    def recommend(self, state: DraftState, topn: int = 5) -> List[Dict[str, Any]]:
        ranked: List[Dict[str, Any]] = []
        for ch in self.legal_candidates(state):
            s, reas = self.score_candidate(ch, state)
            reasons_out = [(a, round(b, 4)) for a, b in reas]
            ranked.append({"champ": ch, "score": round(s, 4), "reasons": reasons_out})
        ranked.sort(key=lambda x: x["score"], reverse=True)
        return ranked[:topn]
