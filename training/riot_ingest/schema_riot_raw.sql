-- Bulk Riot collection: account resolution + match index + raw payloads + resume checkpoints.
-- See training/riot_ingest/collect_riot_matches.py

CREATE TABLE IF NOT EXISTS accounts (
    puuid TEXT PRIMARY KEY,
    game_name TEXT,
    tag_line TEXT,
    region_group TEXT,
    last_seen_at TEXT
);

CREATE TABLE IF NOT EXISTS player_match_index (
    puuid TEXT,
    match_id TEXT,
    seen_at TEXT,
    PRIMARY KEY (puuid, match_id)
);

CREATE TABLE IF NOT EXISTS matches_raw (
    match_id TEXT PRIMARY KEY,
    region_group TEXT,
    fetched_at TEXT,
    json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS crawl_state (
    puuid TEXT PRIMARY KEY,
    next_start INTEGER NOT NULL DEFAULT 0,
    last_count INTEGER NOT NULL DEFAULT 0,
    last_crawled_at TEXT
);

-- Normalized rows (from extract_matches.py)
CREATE TABLE IF NOT EXISTS match_participants (
    match_id TEXT NOT NULL,
    puuid TEXT NOT NULL,
    side TEXT,
    champion_id INTEGER,
    champion_name TEXT,
    team_position TEXT,
    win INTEGER,
    PRIMARY KEY (match_id, puuid)
);

CREATE INDEX IF NOT EXISTS idx_pmi_match ON player_match_index (match_id);
CREATE INDEX IF NOT EXISTS idx_mpart_match ON match_participants (match_id);
CREATE TABLE IF NOT EXISTS match_meta (
    match_id TEXT PRIMARY KEY,
    game_version TEXT,
    queue_id INTEGER,
    map_id INTEGER,
    game_duration_s INTEGER
);

-- PUUID queue for snowball: ladder + harvest from each match’s participants
CREATE TABLE IF NOT EXISTS discovered_puuids (
    puuid TEXT PRIMARY KEY,
    source TEXT,
    first_seen_at TEXT,
    last_crawled_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_disc_crawl ON discovered_puuids (last_crawled_at);
