# Shared draft state contract (v1)

Runtime scoring uses **Riot champion IDs** (integers) everywhere data touches match history or
exported effects. Display names are resolved at the UI/adapter layer via Data Dragon (or
`championById` inside `training/runtime/effects_id.json`).

## Python training / `score_v1.py`

- **File:** JSON validated by `training/json_schema/live_state.schema.json` (loose: extra keys allowed).
- **Core fields:** `patch`, `queue`, `tier_bucket` (or `all`), `side`, `my_role` (use `mid` not `middle` for best alias match in Python), `ally_role_picks`, `enemy_role_picks` (role string → **champion id**), `bans` (id array), `candidates` (id array for ranking), optional `comfort` (id string → 0..1, optional nudge in logit), `n_monte_carlo` (0 = off).
- **Reference fixtures:** `training/examples/live_state.example.json`, `training/examples/parity_state.json`.

## TypeScript / `recommend()`

- **Args:** `DraftEngineState` (`draftState.ts`) = `DraftSnapshot` (ally/enemy `SlotPick[]` with
  `championId` + `championName` + LCU `cellId`, bans, myTeam, …) + `myRole` (`DraftRole` uses
  **`bottom`** for ADC, not `adc`) + `bans` + `unavailable` + `patch` + `tier` + etc.
- **Parity builder:** `parityFixture.ts` maps the Python-style JSON to this shape so the same
  file can drive TS and Python (role alias `adc` → `bottom` for pool + UI).

## draft_v1 (name oracle)

- The literal scorer in `draft_v1/scorer.py` uses **display names** in `ally_locked` /
  `enemy_locked` and the tuple keys produced from **exported** name-keyed logit
  (`draft_v1/data/training_export_name.json` from `training/export_effects` after `champion_dim`
  is populated). It is a regression harness, not the canonical data source.

## Bridge

- `training/runtime/effects_id.json` — `schema: nexus_effects_v1`, `logit_*`, `championById`, optional
  `comfortByChampionId` (when passed to `export_effects` via `--comfort-json`).
