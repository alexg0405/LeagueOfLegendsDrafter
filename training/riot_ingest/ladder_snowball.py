"""
League-v4 ladder seed + snowball crawl (PUUIds from each match).

Riot does not expose a global “most playtime” list. High-tier ranked ladders
(Challenger / Grandmaster / Master) are the usual way to seed *very active*
ranked players, then expand by harvesting all 10 PUUIds per fetched match.

League APIs use *platform* hosts (na1, euw1, …). Match-v5 / account by-puuid
use *regional* routing (americas, europe, asia). This script maps platform -> region.

Examples (from repo root, RIOT_API_KEY in .env):

  python -m training.riot_ingest.ladder_snowball ladder --platform na1
  python -m training.riot_ingest.ladder_snowball snowball --max-puuids 25 --max-pages 2
  python -m training.riot_ingest.extract_matches
"""
from __future__ import annotations

import argparse
import sqlite3
from pathlib import Path
from typing import Dict, List, Optional, Sequence

from training.riot_ingest.collect_riot_matches import (
    DEFAULT_DB,
    collect_for_puuid,
    init_db,
    make_session,
    now_iso,
    riot_get,
    _load_dotenv_riot,
)

# Platform (LoL) -> regional routing for account-v1 / match-v5
# See https://developer.riotgames.com/docs/lol#routing-values
PLATFORM_TO_REGION: Dict[str, str] = {
    "br1": "americas",
    "la1": "americas",
    "la2": "americas",
    "na1": "americas",
    "oc1": "sea",  # OCE: match-v5 / account use `sea`; override with --region if Riot changes policy
    "euw1": "europe",
    "eun1": "europe",
    "tr1": "europe",
    "ru": "europe",
    "jp1": "asia",
    "kr": "asia",
    "ph2": "sea",
    "sg2": "sea",
    "th2": "sea",
    "tw2": "sea",
    "vn2": "sea",
}

LEAGUE_PATHS = {
    "challenger": "challengerleagues",
    "grandmaster": "grandmasterleagues",
    "master": "masterleagues",
}


def region_for_platform(platform: str, override: Optional[str] = None) -> str:
    if override:
        return override
    p = platform.lower().strip()
    if p not in PLATFORM_TO_REGION:
        raise SystemExit(
            f"Unknown platform {platform!r}. Set --region americas|europe|asia|sea "
            f"or add it to PLATFORM_TO_REGION in ladder_snowball.py"
        )
    return PLATFORM_TO_REGION[p]


def fetch_league_json(
    session, platform: str, queue: str, league_key: str
) -> dict:
    path = LEAGUE_PATHS[league_key]
    url = (
        f"https://{platform}.api.riotgames.com/lol/league/v4/{path}/by-queue/{queue}"
    )
    return riot_get(session, url)


def puuids_from_league(data: dict) -> List[str]:
    out: List[str] = []
    for ent in data.get("entries") or []:
        p = ent.get("puuid")
        if p and isinstance(p, str):
            out.append(p)
    return out


def cmd_ladder(
    db: Path,
    platform: str,
    queue: str,
    tiers: Sequence[str],
    region: Optional[str],
) -> int:
    _load_dotenv_riot()
    session = make_session()
    reg = region_for_platform(platform, region)
    conn = sqlite3.connect(str(db))
    init_db(conn)
    total = 0
    for tier in tiers:
        tier = tier.strip().lower()
        if tier not in LEAGUE_PATHS:
            print("skip unknown tier", tier, flush=True)
            continue
        try:
            data = fetch_league_json(session, platform, queue, tier)
        except Exception as e:
            print("ERROR", tier, e, flush=True)
            continue
        puuids = puuids_from_league(data)
        n = 0
        for p in puuids:
            try:
                cur = conn.execute(
                    """
                    INSERT OR IGNORE INTO discovered_puuids (puuid, source, first_seen_at, last_crawled_at)
                    VALUES (?, ?, ?, NULL)
                    """,
                    (p, f"ladder:{tier}", now_iso()),
                )
                if cur.rowcount:
                    n += 1
            except sqlite3.OperationalError as e:
                print("DB error", e, flush=True)
                break
        total += n
        print(f"{tier}: {len(puids)} entries in API, {n} new in queue (region={reg})", flush=True)
    conn.commit()
    conn.close()
    print("Total new PUUIds queued for snowball:", total, flush=True)
    return 0


def cmd_snowball(
    db: Path,
    platform: str,
    max_puuids: int,
    max_pages: int,
    page_size: int,
    region: Optional[str],
) -> int:
    _load_dotenv_riot()
    session = make_session()
    reg = region_for_platform(platform, region)
    conn = sqlite3.connect(str(db))
    init_db(conn)
    rows = conn.execute(
        """
        SELECT puuid FROM discovered_puuids
        WHERE last_crawled_at IS NULL
        ORDER BY first_seen_at
        LIMIT ?
        """,
        (max_puuids,),
    ).fetchall()
    conn.close()
    if not rows:
        print("No pending PUUIds. Run: ladder (or collect CSV) first.", flush=True)
        return 0

    tot = 0
    conn = sqlite3.connect(str(db))
    init_db(conn)
    for (puuid,) in rows:
        try:
            r = collect_for_puuid(
                session,
                conn,
                puuid,
                reg,
                max_pages=max_pages,
                page_size=min(page_size, 100),
                reset=False,
            )
            print(puuid[:12] + "…", r, flush=True)
            tot += r["new_match_payloads_fetched"]
        except Exception as e:
            print("ERROR", puuid[:12], e, flush=True)
    conn.close()
    print("New match payloads this run:", tot, flush=True)
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--db", type=Path, default=DEFAULT_DB)
    ap.add_argument(
        "command",
        choices=["ladder", "snowball"],
        help="ladder: seed from Challenger/GM/Master. snowball: crawl pending PUUIds",
    )
    ap.add_argument(
        "--platform",
        default="na1",
        help="e.g. na1, euw1, kr (league + match use same mapping)",
    )
    ap.add_argument(
        "--queue",
        default="RANKED_SOLO_5x5",
        help="League v4 queue id",
    )
    ap.add_argument(
        "--region",
        default=None,
        help="Override regional routing for match-v5 (americas, europe, asia, sea)",
    )
    ap.add_argument(
        "--tiers",
        default="challenger,grandmaster,master",
        help="Comma-separated: challenger,grandmaster,master (ladder only)",
    )
    ap.add_argument(
        "--max-puuids",
        type=int,
        default=30,
        help="Max pending players to process (snowball)",
    )
    ap.add_argument(
        "--max-pages",
        type=int,
        default=2,
        help="Match history pages per PUUID (snowball)",
    )
    ap.add_argument(
        "--page-size",
        type=int,
        default=100,
    )
    args = ap.parse_args()
    args.db.parent.mkdir(parents=True, exist_ok=True)

    if args.command == "ladder":
        tiers = [x.strip() for x in args.tiers.split(",") if x.strip()]
        return cmd_ladder(
            args.db, args.platform, args.queue, tiers, args.region
        )
    return cmd_snowball(
        args.db,
        args.platform,
        args.max_puuids,
        args.max_pages,
        args.page_size,
        args.region,
    )


if __name__ == "__main__":
    raise SystemExit(main())
