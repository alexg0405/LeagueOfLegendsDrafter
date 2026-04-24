"""
End-to-end smoke test: load runtime DB, build state, print top N recommendations.

  python -m draft_v1.main
  (from repository root, after: python -m draft_v1.build_aggregates --init-schema --seed-sample --rebuild)
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from .live_feed_adapter import to_state
from .load_data import make_scorer


def _default_pool() -> list[str]:
    return ["Jinx", "Xayah", "Ashe", "Caitlyn", "Draven", "Kalista", "Aurora"]


def main() -> int:
    here = Path(__file__).resolve().parent
    db = here / "data" / "stats.db"
    if not db.is_file():
        print("Missing", db, file=sys.stderr)
        print("Run:  python -m draft_v1.build_aggregates --init-schema --seed-sample --rebuild", file=sys.stderr)
        return 1

    state = to_state(
        patch="16.8",
        queue="ranked_solo",
        tier="emerald_plus",
        my_role="adc",
        ally_locked={"top": "Aatrox", "jungle": "Viego", "support": "Thresh"},
        enemy_locked={"top": "Malphite", "mid": "Taliyah", "support": "Rell"},
        bans=["Draven", "Kalista", "Aurora"],
    )
    tags = here / "data" / "champ_tags.json"
    scorer = make_scorer(db, champ_pool=_default_pool(), tags=tags if tags.is_file() else None)
    out = scorer.recommend(state, topn=5)
    print(json.dumps(out, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
