#!/usr/bin/env python3
"""
One-way export bridge: canonical training logit_*.json (id keys) + champion_dim
-> runtime artifacts for TypeScript and optional draft_v1 name-keyed fixtures.

Input (default):
  - training/nexus_training.db: champion_dim (id -> name) from populate_champion_dim
  - training/examples/effects: logit_base.json, logit_matchup.json, logit_synergy.json, logit_comp.json
     (produced by training/etl/aggregate_effects.py)

Output:
  - training/runtime/effects_id.json: schema nexus_effects_v1, id keys, + championById
  - draft_v1/data/training_export_name.json: same logical effects, string champion names
     (for regression against draft_v1/scorer.py)

Usage:
  python -m training.export_effects
  python -m training.export_effects --db training/nexus_training.db --effects-in training/examples/effects
 """
from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

SCHEMA = "nexus_effects_v1"
DEFAULT_DB = Path("training/nexus_training.db")
DEFAULT_EFFECTS = Path("training/examples/effects")
OUT_ID = Path("training/runtime/effects_id.json")
OUT_NAME = Path("draft_v1/data/training_export_name.json")


def load_champion_map(db: Path) -> Tuple[Dict[int, str], Dict[int, str]]:
    id_name: Dict[int, str] = {}
    id_norm: Dict[int, str] = {}
    if not db.is_file():
        return id_name, id_norm
    con = sqlite3.connect(str(db))
    try:
        for cid, cname, norm in con.execute(
            "SELECT champion_id, champion_name, normalized_name FROM champion_dim"
        ):
            if not cid or not cname:
                continue
            id_name[int(cid)] = str(cname)
            if norm:
                id_norm[int(cid)] = str(norm)
    except sqlite3.OperationalError:
        pass
    finally:
        con.close()
    return id_name, id_norm


def load_effects(d: Path) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    for stem in ("logit_base", "logit_matchup", "logit_synergy", "logit_comp"):
        p = d / f"{stem}.json"
        if p.is_file():
            out[stem] = json.loads(p.read_text(encoding="utf-8"))
        else:
            out[stem] = {}
    return out


def _map_key(
    k: str, id_to_name: Dict[int, str], missing: str
) -> str:
    try:
        i = int(k)
    except (TypeError, ValueError):
        return k
    if i in id_to_name:
        return id_to_name[i]
    return f"{missing}{i}" if missing else str(i)


def transform_id_keys(d: Any, id_to_name: Dict[int, str]) -> Any:
    """
    Recursively map dicts whose keys are numeric champion ids (strings)
    to champion names. Handles:
    - { cid -> float }  (base, comp)
    - { cid -> { oid -> float } }  (matchup, synergy)
    and deeper prefix trees (patch/queue/tier/role/...).
    """
    if not isinstance(d, dict) or not d:
        return d
    vals = list(d.values())
    if all(isinstance(v, (int, float)) for v in vals):
        return {_map_key(k, id_to_name, "id:"): v for k, v in d.items()}
    if all(isinstance(v, dict) for v in vals) and vals:
        sub0 = next(iter(d.values()))
        if sub0 and all(isinstance(x, (int, float)) for x in sub0.values()):
            return {
                _map_key(k, id_to_name, "id:"): {
                    _map_key(ek, id_to_name, "id:"): ev for ek, ev in v.items()
                }
                for k, v in d.items()
            }
    return {k2: transform_id_keys(v, id_to_name) for k2, v in d.items()}


def build_champion_by_id(
    id_to_name: Dict[int, str], id_to_norm: Dict[int, str]
) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for cid in sorted(id_to_name.keys()):
        rows.append(
            {
                "id": cid,
                "name": id_to_name[cid],
                "normalizedName": id_to_norm.get(cid) or str(id_to_name[cid]).lower().replace(" ", ""),
            }
        )
    return rows


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--db", type=Path, default=DEFAULT_DB)
    ap.add_argument("--effects-in", type=Path, default=DEFAULT_EFFECTS, help="logit_*.json directory")
    ap.add_argument("--out-id", type=Path, default=OUT_ID)
    ap.add_argument("--out-name", type=Path, default=OUT_NAME, help="name-keyed export for draft_v1")
    ap.add_argument(
        "--skip-name",
        action="store_true",
        help="only write id artifact (e.g. empty champion_dim)",
    )
    ap.add_argument(
        "--comfort-json",
        type=Path,
        default=None,
        help="optional { championIdStr: 0-1 } merged into id bundle as comfortByChampionId",
    )
    args = ap.parse_args()

    if not args.effects_in.is_dir():
        print("effects dir not found:", args.effects_in, file=sys.stderr)
        return 1

    eff = load_effects(args.effects_in)
    id_name, id_norm = load_champion_map(args.db)
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    comfort: Dict[str, float] = {}
    if args.comfort_json and args.comfort_json.is_file():
        raw_c = json.loads(args.comfort_json.read_text(encoding="utf-8"))
        if isinstance(raw_c, dict):
            for k, v in raw_c.items():
                if isinstance(v, (int, float)):
                    comfort[str(k)] = float(v)

    bundle_id: Dict[str, Any] = {
        "schema": SCHEMA,
        "source": "training/etl/aggregate_effects.py + champion_dim + optional comfort",
        "meta": {
            "schemaVersion": 1,
            "exportedAt": now,
            "effectsIn": str(args.effects_in).replace("\\", "/"),
        },
        "logit_base": eff.get("logit_base") or {},
        "logit_matchup": eff.get("logit_matchup") or {},
        "logit_synergy": eff.get("logit_synergy") or {},
        "logit_comp": eff.get("logit_comp") or {},
        "championById": {
            str(k): {"name": v, "normalizedName": id_norm.get(k) or v.lower().replace(" ", "")}
            for k, v in id_name.items()
        },
    }
    if comfort:
        bundle_id["comfortByChampionId"] = comfort
    args.out_id.parent.mkdir(parents=True, exist_ok=True)
    args.out_id.write_text(
        json.dumps(bundle_id, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    print("wrote", args.out_id, file=sys.stderr)

    if args.skip_name:
        return 0
    if not id_name:
        print(
            "warning: champion_dim empty — name export uses id:#### placeholder keys. "
            "Run: python -m training.scripts.populate_champion_dim --db " + str(args.db),
            file=sys.stderr,
        )
    out_name: Dict[str, Any] = {
        "schema": SCHEMA + "_name_keys",
        "source": "training/export_effects.py (id -> name via champion_dim)",
        "meta": {
            "schemaVersion": 1,
            "exportedAt": now,
        },
        "logit_base": transform_id_keys(
            deepcopy(eff.get("logit_base") or {}), id_name
        ),
        "logit_matchup": transform_id_keys(
            deepcopy(eff.get("logit_matchup") or {}), id_name
        ),
        "logit_synergy": transform_id_keys(
            deepcopy(eff.get("logit_synergy") or {}), id_name
        ),
        "logit_comp": transform_id_keys(
            deepcopy(eff.get("logit_comp") or {}), id_name
        )
        if isinstance(eff.get("logit_comp"), dict)
        else {},
        "champions": build_champion_by_id(id_name, id_norm),
    }
    if comfort:
        out_name["comfortByChampionId"] = comfort
    args.out_name.parent.mkdir(parents=True, exist_ok=True)
    args.out_name.write_text(
        json.dumps(out_name, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    print("wrote", args.out_name, file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
