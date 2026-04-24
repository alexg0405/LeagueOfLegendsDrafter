"""
Parse Riot match-v5 JSON into two team_perspective training dicts.
Uses teamPosition; falls back to individualPosition when teamPosition is empty.
"""
from __future__ import annotations

import hashlib
import json
import re
from typing import Any, Dict, List, Optional, Tuple

# Riot / Data Dragon: Summoner's Rift
MAP_SR = 11

_POS_TO_OUR = {
    "TOP": "top",
    "JUNGLE": "jungle",
    "MIDDLE": "mid",
    "BOTTOM": "adc",
    "UTILITY": "support",
}

# queueId from match-v5 / Riot
QUEUE_BUCKET: Dict[int, str] = {
    420: "ranked_solo",
    440: "ranked_flex",
    400: "normal_draft",
    430: "normal_blind",
    450: "aram",
    1700: "arena",
    0: "custom",
}

OUR_ROLES = ("top", "jungle", "mid", "adc", "support")


def _patch_bucket(game_version: str) -> str:
    """
    e.g. '15.1.1.1' -> '15.1' (major.minor for bucketing; tune as you like).
    """
    s = (game_version or "").strip()
    m = re.match(r"^(\d+)\.(\d+)", s)
    if not m:
        return "0.0"
    return f"{m.group(1)}.{m.group(2)}"


def _platform_from_match_id(match_id: str) -> str:
    if "_" in match_id:
        return match_id.split("_", 1)[0].lower()
    return "unknown"


def _champ_bans(teams: List[dict], team_id: int) -> List[int]:
    for t in teams or []:
        if t.get("teamId") == team_id:
            out: List[int] = []
            for b in t.get("bans") or []:
                cid = b.get("championId")
                if isinstance(cid, int) and cid > 0:
                    out.append(cid)
            return out
    return []


def _team_won_participants(participants: List[dict], team_id: int) -> bool:
    for p in participants or []:
        if p.get("teamId") == team_id:
            return bool(p.get("win"))
    return False


def _build_role_to_champ(
    participants: List[dict], team_id: int
) -> Optional[Dict[str, int]]:
    # participant.teamId: 100 or 200
    role_to_c: Dict[str, int] = {}
    for p in participants:
        if p.get("teamId") != team_id:
            continue
        tpos = p.get("teamPosition")
        ipos = p.get("individualPosition")
        pos = (tpos if isinstance(tpos, str) else "") or (ipos if isinstance(ipos, str) else "")
        pos = pos.strip().upper()
        if not pos or pos in ("NONE", "INVALID"):
            pos = ((ipos if isinstance(ipos, str) else "") or "").strip().upper()
        key = _POS_TO_OUR.get(pos)
        if not key:
            continue
        cid = p.get("championId")
        if not isinstance(cid, int) or cid <= 0:
            return None
        if key in role_to_c and role_to_c[key] != cid:
            return None
        role_to_c[key] = cid
    if set(role_to_c.keys()) != set(OUR_ROLES):
        return None
    return role_to_c


def parse_match_to_rows(
    match: Dict[str, Any],
    *,
    tier_bucket: str = "all",
    region: str = "unknown",
) -> List[Dict[str, Any]]:
    """
    Return 0 or 2 row dicts ready for team_perspective insert.
    """
    out: List[Dict[str, Any]] = []
    meta = match.get("metadata") or {}
    info = match.get("info")
    if not isinstance(info, dict):
        return out
    if int(info.get("mapId") or 0) != MAP_SR:
        return out

    match_id = str(meta.get("matchId") or info.get("gameId") or "")
    if not match_id:
        return out
    platform_id = _platform_from_match_id(match_id)

    qid = int(info.get("queueId") or 0)
    queue_bucket = QUEUE_BUCKET.get(qid) or f"queue_{qid}"
    if queue_bucket in ("aram",) or qid == 450:
        return out

    patch_bucket = _patch_bucket(str(info.get("gameVersion") or ""))
    participants: List[dict] = list(info.get("participants") or [])
    if len(participants) < 10:
        return out
    teams: List[dict] = list(info.get("teams") or [])
    if len(teams) < 2:
        return out

    ally_100 = _build_role_to_champ(participants, 100)
    ally_200 = _build_role_to_champ(participants, 200)
    if not ally_100 or not ally_200:
        return out

    bans_100 = _champ_bans(teams, 100)
    bans_200 = _champ_bans(teams, 200)
    w100 = _team_won_participants(participants, 100)
    w200 = _team_won_participants(participants, 200)

    for team_id, side, ally, enemy, bf, be, won in [
        (100, "blue", ally_100, ally_200, bans_100, bans_200, 1 if w100 else 0),
        (200, "red", ally_200, ally_100, bans_200, bans_100, 1 if w200 else 0),
    ]:
        payload = {
            "match_id": match_id,
            "platform_id": platform_id,
            "team_id": team_id,
            "side": side,
            "patch_bucket": patch_bucket,
            "queue_bucket": queue_bucket,
            "tier_bucket": tier_bucket,
            "region": region,
            "won": won,
            "role_picks": ally,
            "enemy_picks": enemy,
            "bans_friendly": bf,
            "bans_enemy": be,
        }
        h = hashlib.sha256(
            json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
        ).hexdigest()[:32]
        out.append(
            {
                "match_id": match_id,
                "platform_id": platform_id,
                "team_id": team_id,
                "side": side,
                "patch_bucket": patch_bucket,
                "queue_bucket": queue_bucket,
                "tier_bucket": tier_bucket,
                "region": region,
                "won": won,
                "role_picks_json": json.dumps(ally, separators=(",", ":"), sort_keys=True),
                "enemy_role_picks_json": json.dumps(
                    enemy, separators=(",", ":"), sort_keys=True
                ),
                "bans_friendly_json": json.dumps(bf),
                "bans_enemy_json": json.dumps(be),
                "row_hash": h,
            }
        )
    return out
