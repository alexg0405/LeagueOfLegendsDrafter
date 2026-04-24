-- Nexus Draft: offline training + precomputed effect storage (SQLite 3)
-- Riot: match-v5 is source of truth for outcomes; Data Dragon for id ↔ key/name.
-- One queue + one patch bucket + one tier at a time in early models; partition via columns.

-- Canonical id ↔ name for exports (UI, draft_v1 name oracle, debug). Populate via
-- `python -m training.scripts.populate_champion_dim` (DDragon) or ETL.
CREATE TABLE IF NOT EXISTS champion_dim (
  champion_id INTEGER PRIMARY KEY,
  champion_name TEXT NOT NULL,
  normalized_name TEXT
);
CREATE INDEX IF NOT EXISTS idx_champ_dim_norm ON champion_dim (normalized_name);

-- Match-level metadata from Riot (minimal fields; extend as ETL grows)
CREATE TABLE IF NOT EXISTS match_meta (
  match_id TEXT NOT NULL,
  platform_id TEXT,
  data_version TEXT,
  queue_id INTEGER,
  game_duration_s INTEGER,
  game_creation_ms INTEGER,
  map_id INTEGER,
  region TEXT,
  PRIMARY KEY (match_id, platform_id)
);

-- Two rows per Summoner's Rift 5v5: one from each team's perspective
CREATE TABLE IF NOT EXISTS team_perspective (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id TEXT NOT NULL,
  platform_id TEXT NOT NULL,
  team_id INTEGER NOT NULL CHECK (team_id IN (100, 200)),
  side TEXT NOT NULL CHECK (side IN ('blue', 'red')),
  patch_bucket TEXT NOT NULL,
  queue_bucket TEXT NOT NULL,
  tier_bucket TEXT,
  region TEXT,
  won INTEGER NOT NULL CHECK (won IN (0, 1)),
  -- Champion ids (Riot numeric id from participant.championId), keyed by role
  role_picks_json TEXT NOT NULL,       -- { "top": 266, "jungle": 234, ... }
  enemy_role_picks_json TEXT NOT NULL, -- same shape
  bans_friendly_json TEXT,            -- [ id, ... ]
  bans_enemy_json TEXT,
  -- Raw payload hash for idempotent re-ingest
  row_hash TEXT,
  UNIQUE (match_id, platform_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_tp_patch_queue
  ON team_perspective (patch_bucket, queue_bucket, tier_bucket);
CREATE INDEX IF NOT EXISTS idx_tp_match ON team_perspective (match_id, platform_id);

-- Baseline strength: champion in role (smoothed)
CREATE TABLE IF NOT EXISTS effect_base (
  patch_bucket TEXT NOT NULL,
  queue_bucket TEXT NOT NULL,
  tier_bucket TEXT NOT NULL DEFAULT 'all',
  role TEXT NOT NULL,
  champion_id INTEGER NOT NULL,
  games INTEGER NOT NULL,
  wins INTEGER NOT NULL,
  smoothed_p REAL,
  logit_effect REAL, -- logit(p_smooth) - logit(prior)
  prior REAL NOT NULL DEFAULT 0.5,
  k_shrink INTEGER NOT NULL DEFAULT 200,
  updated_at TEXT,
  PRIMARY KEY (patch_bucket, queue_bucket, tier_bucket, role, champion_id)
);

-- Matchup: candidate in my_role into enemy champion (lane / general)
CREATE TABLE IF NOT EXISTS effect_matchup (
  patch_bucket TEXT NOT NULL,
  queue_bucket TEXT NOT NULL,
  tier_bucket TEXT NOT NULL DEFAULT 'all',
  my_role TEXT NOT NULL,
  champion_id INTEGER NOT NULL,
  enemy_id INTEGER NOT NULL,
  games INTEGER NOT NULL,
  wins INTEGER NOT NULL,
  smoothed_p REAL,
  logit_effect REAL,
  prior REAL NOT NULL DEFAULT 0.5,
  k_shrink INTEGER NOT NULL DEFAULT 200,
  updated_at TEXT,
  PRIMARY KEY (patch_bucket, queue_bucket, tier_bucket, my_role, champion_id, enemy_id)
);

-- Synergy: candidate in my_role with locked ally in ally_role
CREATE TABLE IF NOT EXISTS effect_synergy (
  patch_bucket TEXT NOT NULL,
  queue_bucket TEXT NOT NULL,
  tier_bucket TEXT NOT NULL DEFAULT 'all',
  my_role TEXT NOT NULL,
  ally_role TEXT NOT NULL,
  candidate_id INTEGER NOT NULL,
  ally_id INTEGER NOT NULL,
  games INTEGER NOT NULL,
  wins INTEGER NOT NULL,
  smoothed_p REAL,
  logit_effect REAL,
  prior REAL NOT NULL DEFAULT 0.5,
  k_shrink INTEGER NOT NULL DEFAULT 200,
  updated_at TEXT,
  PRIMARY KEY (patch_bucket, queue_bucket, tier_bucket, my_role, ally_role, candidate_id, ally_id)
);

-- Trained final-draft model metadata (logistic / GBDT export)
CREATE TABLE IF NOT EXISTS model_artifact (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  patch_bucket_min TEXT,
  patch_bucket_max TEXT,
  queue_bucket TEXT NOT NULL,
  tier_bucket TEXT NOT NULL DEFAULT 'all',
  my_role TEXT,
  framework TEXT, -- 'sklearn' | 'catboost' | 'lightgbm' | custom
  artifact_uri TEXT, -- file path, S3, etc.
  train_rows INTEGER,
  metrics_json TEXT, -- { "auc", "brier", "calibration" : ... }
  created_at TEXT NOT NULL,
  UNIQUE (name, version, queue_bucket, tier_bucket, my_role)
);

-- Optional: comp-level hand labels or weak features (engage, frontline) keyed by (patch, role comp hash)
CREATE TABLE IF NOT EXISTS champion_tags (
  champion_id INTEGER PRIMARY KEY,
  tags_json TEXT -- { "class": "tank", "damage": "ap", "engage": 0.7 }
);
