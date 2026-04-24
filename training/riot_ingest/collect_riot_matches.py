"""
Resolve Riot IDs -> PUUID, list match IDs, de-dupe, fetch full match-v5 JSON under 429/rate limits.

  set RIOT_API_KEY=...   (Windows: $env:RIOT_API_KEY="...")
  python -m training.riot_ingest.collect_riot_matches --csv training/riot_ingest/seed/riot_ids.example.csv

`--region` is Riot *routing* (default: americas for NA accounts). You can also pass a shard
alias, e.g. --region na. One region per run for the whole CSV.
Account URL: /riot/account/v1/accounts/by-riot-id/{gameName}/{tagLine} — path segments must be URL-encoded.
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import sqlite3
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import quote

import requests

DEFAULT_REGION = "americas"
DEFAULT_DB = Path("training/data/riot_matches.db")

# Riot regional routing (not platform hosts like na1). See developer.riotgames.com docs.
_ROUTING_ALIASES: Dict[str, str] = {
    "americas": "americas",
    "ame": "americas",
    "na": "americas",
    "na1": "americas",
    "br": "americas",
    "br1": "americas",
    "lan": "americas",
    "la1": "americas",
    "la2": "americas",
    "las": "americas",
    "oce": "americas",
    "oc1": "americas",
    "pbe": "americas",
    "europe": "europe",
    "eu": "europe",
    "euw": "europe",
    "euw1": "europe",
    "eune": "europe",
    "eun": "europe",
    "eun1": "europe",
    "tr": "europe",
    "tr1": "europe",
    "ru": "europe",
    "ru1": "europe",
    "asia": "asia",
    "kr": "asia",
    "jp": "asia",
    "jp1": "asia",
    "ph": "asia",
    "sg": "asia",
    "th": "asia",
    "tw": "asia",
    "vn": "asia",
    "sea": "asia",
}


def normalize_routing_token(cell: str) -> str:
    """Map americas|europe|asia or a common shard alias. Raises ValueError if unknown."""
    t = (cell or "").strip().lower()
    if not t:
        raise ValueError("empty region")
    if t in ("americas", "europe", "asia"):
        return t
    if t in _ROUTING_ALIASES:
        return _ROUTING_ALIASES[t]
    raise ValueError(
        f"Unknown region {cell!r}. Use americas, europe, or asia, or a shard like na, euw, kr."
    )


def _load_dotenv_riot() -> None:
    """Load RIOT_API_KEY from project .env if not already set (no extra dependency)."""
    if (os.environ.get("RIOT_API_KEY") or "").strip():
        return
    for base in (Path(__file__).resolve().parent.parent.parent, Path.cwd()):
        p = base / ".env"
        if not p.is_file():
            continue
        for line in p.read_text(encoding="utf-8").splitlines():
            s = line.strip()
            if not s or s.startswith("#") or "=" not in s:
                continue
            k, v = s.split("=", 1)
            if k.strip() == "RIOT_API_KEY":
                os.environ["RIOT_API_KEY"] = v.strip().strip('"').strip("'")
                return


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def init_db(conn: sqlite3.Connection) -> None:
    root = Path(__file__).resolve().parent
    sql = (root / "schema_riot_raw.sql").read_text(encoding="utf-8")
    conn.executescript(sql)
    conn.commit()


def make_session() -> requests.Session:
    key = (os.environ.get("RIOT_API_KEY") or "").strip()
    if not key:
        raise SystemExit("Set RIOT_API_KEY in the environment")
    s = requests.Session()
    s.headers.update({"X-Riot-Token": key})
    return s


def riot_get(
    session: requests.Session,
    url: str,
    params: Optional[dict] = None,
    max_retries: int = 5,
) -> Any:
    for attempt in range(max_retries):
        r = session.get(url, params=params, timeout=60)

        if r.status_code == 200:
            return r.json()

        if r.status_code == 429:
            ra = r.headers.get("Retry-After", "1")
            try:
                wait = int(float(ra)) + 1
            except ValueError:
                wait = 2
            time.sleep(wait)
            continue

        if r.status_code in (500, 502, 503, 504):
            time.sleep(min(2**attempt, 30))
            continue

        if r.status_code in (400, 401, 403, 404):
            raise RuntimeError(f"GET {url} -> {r.status_code}: {r.text[:800]}")

        raise RuntimeError(f"GET {url} -> {r.status_code}: {r.text[:800]}")

    raise RuntimeError(f"GET {url} failed after {max_retries} retries")


def get_account_by_riot_id(
    session: requests.Session, game_name: str, tag_line: str, region_group: str
) -> dict:
    enc_game = quote(game_name, safe="")
    enc_tag = quote(tag_line, safe="")
    url = (
        f"https://{region_group}.api.riotgames.com/riot/account/v1/accounts"
        f"/by-riot-id/{enc_game}/{enc_tag}"
    )
    return riot_get(session, url)


def get_match_ids_by_puuid(
    session: requests.Session,
    puuid: str,
    region_group: str,
    start: int = 0,
    count: int = 100,
) -> List[str]:
    url = (
        f"https://{region_group}.api.riotgames.com/lol/match/v5/matches"
        f"/by-puuid/{puuid}/ids"
    )
    return riot_get(session, url, params={"start": start, "count": count})


def get_match(
    session: requests.Session, match_id: str, region_group: str
) -> dict:
    url = f"https://{region_group}.api.riotgames.com/lol/match/v5/matches/{match_id}"
    return riot_get(session, url)


def upsert_account(
    conn: sqlite3.Connection,
    puuid: str,
    game_name: str,
    tag_line: str,
    region_group: str,
) -> None:
    conn.execute(
        """
        INSERT INTO accounts (puuid, game_name, tag_line, region_group, last_seen_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (puuid) DO UPDATE SET
            game_name = excluded.game_name,
            tag_line = excluded.tag_line,
            region_group = excluded.region_group,
            last_seen_at = excluded.last_seen_at
        """,
        (puuid, game_name, tag_line, region_group, now_iso()),
    )


def insert_player_match_edges(
    conn: sqlite3.Connection, puuid: str, match_ids: List[str]
) -> List[str]:
    new_ids: List[str] = []
    for mid in match_ids:
        cur = conn.execute(
            """
            INSERT OR IGNORE INTO player_match_index (puuid, match_id, seen_at)
            VALUES (?, ?, ?)
            """,
            (puuid, mid, now_iso()),
        )
        if cur.rowcount and cur.rowcount > 0:
            new_ids.append(mid)
    return new_ids


def match_already_saved(conn: sqlite3.Connection, match_id: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM matches_raw WHERE match_id = ?",
        (match_id,),
    ).fetchone()
    return row is not None


def save_match_raw(
    conn: sqlite3.Connection, match_id: str, region_group: str, payload: dict
) -> None:
    conn.execute(
        """
        INSERT OR IGNORE INTO matches_raw (match_id, region_group, fetched_at, json)
        VALUES (?, ?, ?, ?)
        """,
        (match_id, region_group, now_iso(), json.dumps(payload, separators=(",", ":"))),
    )


def get_crawl_start(conn: sqlite3.Connection, puuid: str, reset: bool) -> int:
    if reset:
        conn.execute("DELETE FROM crawl_state WHERE puuid = ?", (puuid,))
        return 0
    row = conn.execute(
        "SELECT next_start FROM crawl_state WHERE puuid = ?",
        (puuid,),
    ).fetchone()
    if row and row[0] is not None:
        return int(row[0])
    return 0


def set_crawl_state(
    conn: sqlite3.Connection,
    puuid: str,
    next_start: int,
    last_count: int,
) -> None:
    conn.execute(
        """
        INSERT INTO crawl_state (puuid, next_start, last_count, last_crawled_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT (puuid) DO UPDATE SET
            next_start = excluded.next_start,
            last_count = excluded.last_count,
            last_crawled_at = excluded.last_crawled_at
        """,
        (puuid, next_start, last_count, now_iso()),
    )


def ensure_tracked_puuid(
    conn: sqlite3.Connection, puuid: str, source: str
) -> None:
    try:
        conn.execute(
            """
            INSERT OR IGNORE INTO discovered_puuids (puuid, source, first_seen_at, last_crawled_at)
            VALUES (?, ?, ?, NULL)
            """,
            (puuid, source, now_iso()),
        )
    except sqlite3.OperationalError:
        # older DBs without table; no-op
        pass


def mark_discovered_crawled(conn: sqlite3.Connection, puuid: str) -> None:
    try:
        t = now_iso()
        cur = conn.execute(
            "UPDATE discovered_puuids SET last_crawled_at = ? WHERE puuid = ?",
            (t, puuid),
        )
        if not getattr(cur, "rowcount", 0):
            ensure_tracked_puuid(conn, puuid, "crawl:implicit")
            conn.execute(
                "UPDATE discovered_puuids SET last_crawled_at = ? WHERE puuid = ?",
                (t, puuid),
            )
    except sqlite3.OperationalError:
        pass


def record_discovered_from_match(
    conn: sqlite3.Connection, payload: dict, match_id: str
) -> int:
    """Enqueue participant PUUIds for future snowball (INSERT OR IGNORE)."""
    n = 0
    for p in (payload.get("info") or {}).get("participants") or []:
        pid = p.get("puuid")
        if not pid:
            continue
        try:
            cur = conn.execute(
                """
                INSERT OR IGNORE INTO discovered_puuids (puuid, source, first_seen_at, last_crawled_at)
                VALUES (?, ?, ?, NULL)
                """,
                (pid, f"match:{match_id}", now_iso()),
            )
            if cur.rowcount:
                n += 1
        except sqlite3.OperationalError:
            return n
    return n


def get_account_by_puuid(
    session: requests.Session, puuid: str, region_group: str
) -> dict:
    url = f"https://{region_group}.api.riotgames.com/riot/account/v1/accounts/by-puuid/{puuid}"
    return riot_get(session, url)


def collect_match_history_for_puuid(
    session: requests.Session,
    conn: sqlite3.Connection,
    puuid: str,
    region_group: str,
    *,
    max_pages: int = 3,
    page_size: int = 100,
    max_match_downloads: int = 0,
    reset: bool = False,
    label_for_empty: str = "",
) -> Dict[str, Any]:
    start = get_crawl_start(conn, puuid, reset=reset)
    unseen: List[str] = []

    for _page in range(max(1, max_pages)):
        match_ids = get_match_ids_by_puuid(
            session, puuid, region_group, start=start, count=page_size
        )
        if not match_ids:
            if _page == 0 and label_for_empty:
                print(
                    f"  [warn] 0 match IDs from match-v5 for this puuid: {label_for_empty}",
                    flush=True,
                )
            set_crawl_state(conn, puuid, start, 0)
            break

        new_edges = insert_player_match_edges(conn, puuid, match_ids)
        unseen.extend(new_edges)
        n_new = len(new_edges)

        if n_new == 0 and len(match_ids) == page_size:
            start += page_size
            set_crawl_state(conn, puuid, start, page_size)
            break
        if len(match_ids) < page_size:
            start += len(match_ids)
            set_crawl_state(conn, puuid, start, len(match_ids))
            break
        start += page_size
        set_crawl_state(conn, puuid, start, page_size)
        if n_new == 0:
            break

    conn.commit()
    ordered = list(dict.fromkeys(unseen))
    fetched = 0
    cap = max(0, int(max_match_downloads or 0))
    cap_hit = False
    for mid in ordered:
        if cap and fetched >= cap:
            cap_hit = True
            break
        if match_already_saved(conn, mid):
            continue
        payload = get_match(session, mid, region_group)
        save_match_raw(conn, mid, region_group, payload)
        try:
            record_discovered_from_match(conn, payload, mid)
        except sqlite3.OperationalError:
            pass
        fetched += 1
        conn.commit()

    out: Dict[str, Any] = {
        "puuid": puuid,
        "new_match_refs": len(ordered),
        "new_match_payloads_fetched": fetched,
    }
    if cap_hit:
        out["match_download_cap_hit"] = True
    return out


def collect_for_puuid(
    session: requests.Session,
    conn: sqlite3.Connection,
    puuid: str,
    region_group: str,
    *,
    max_pages: int = 3,
    page_size: int = 100,
    max_match_downloads: int = 0,
    reset: bool = False,
) -> Dict[str, Any]:
    gname, tline = "", ""
    try:
        acct = get_account_by_puuid(session, puuid, region_group)
        gname = (acct.get("gameName") or "") or ""
        tline = (acct.get("tagLine") or "") or ""
    except Exception:
        pass
    upsert_account(conn, puuid, gname, tline, region_group)
    r = collect_match_history_for_puuid(
        session,
        conn,
        puuid,
        region_group,
        max_pages=max_pages,
        page_size=page_size,
        max_match_downloads=max_match_downloads,
        reset=reset,
        label_for_empty=puuid[:12] + "…",
    )
    mark_discovered_crawled(conn, puuid)
    return r


def collect_for_riot_id(
    session: requests.Session,
    conn: sqlite3.Connection,
    game_name: str,
    tag_line: str,
    region_group: str,
    *,
    max_pages: int = 3,
    page_size: int = 100,
    max_match_downloads: int = 0,
    reset_crawl: bool = False,
) -> Dict[str, Any]:
    acct = get_account_by_riot_id(session, game_name, tag_line, region_group)
    puuid = acct["puuid"]
    upsert_account(conn, puuid, game_name, tag_line, region_group)
    ensure_tracked_puuid(conn, puuid, "manual_csv")
    r = collect_match_history_for_puuid(
        session,
        conn,
        puuid,
        region_group,
        max_pages=max_pages,
        page_size=page_size,
        max_match_downloads=max_match_downloads,
        reset=reset_crawl,
        label_for_empty=f"{game_name}#{tag_line}",
    )
    mark_discovered_crawled(conn, puuid)
    return r


def load_seed_csv(path: Path) -> List[Tuple[str, str]]:
    out: List[Tuple[str, str]] = []
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            g = (row.get("game_name") or row.get("gameName") or "").strip()
            t = (row.get("tag_line") or row.get("tagLine") or "").strip()
            if g and t:
                out.append((g, t))
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--csv",
        type=Path,
        default=Path("training/riot_ingest/seed/riot_ids.example.csv"),
        help="Columns: game_name, tag_line (NA accounts: use default --region)",
    )
    ap.add_argument("--db", type=Path, default=DEFAULT_DB, help="SQLite file path")
    ap.add_argument(
        "--region",
        default=DEFAULT_REGION,
        help="Regional routing for the whole run: americas|europe|asia or short aliases (e.g. na, euw). Default: americas",
    )
    ap.add_argument(
        "--max-pages",
        type=int,
        default=8,
        help="Number of 100-id list pages per Riot ID (up to 800 refs/run; early-exit on dup page).",
    )
    ap.add_argument(
        "--page-size",
        type=int,
        default=100,
        help="Count param to match-v5 (max 100)",
    )
    ap.add_argument(
        "--max-match-downloads",
        type=int,
        default=0,
        help="Max new full match JSONs to fetch per PUUID this run (0 = no limit). Cuts off after N downloads; re-run to continue.",
    )
    ap.add_argument(
        "--reset-crawl",
        action="store_true",
        help="Start listing match IDs from start=0 for each account in this run",
    )
    args = ap.parse_args()

    if args.page_size > 100:
        ap.error("Riot allows at most count=100 for match list")

    try:
        routing = normalize_routing_token(args.region)
    except ValueError as e:
        ap.error(f"--region: {e}")

    _load_dotenv_riot()
    args.db.parent.mkdir(parents=True, exist_ok=True)
    session = make_session()
    # Long runs + optional readers (e.g. DB browser): wait on lock instead of failing fast.
    conn = sqlite3.connect(str(args.db), timeout=60.0)
    conn.execute("PRAGMA busy_timeout=60000")
    try:
        conn.execute("PRAGMA journal_mode=WAL")
    except sqlite3.Error:
        pass
    init_db(conn)

    total_payloads = 0
    for game_name, tag_line in load_seed_csv(args.csv):
        try:
            r = collect_for_riot_id(
                session,
                conn,
                game_name,
                tag_line,
                routing,
                max_pages=args.max_pages,
                page_size=min(args.page_size, 100),
                max_match_downloads=max(0, int(args.max_match_downloads or 0)),
                reset_crawl=args.reset_crawl,
            )
            print(game_name, tag_line, r)
            total_payloads += r["new_match_payloads_fetched"]
        except Exception as e:
            print("ERROR", game_name, tag_line, e, flush=True)

    print("Total new match payloads stored:", total_payloads)
    conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
