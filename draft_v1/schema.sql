-- Raw tables (ETL from Riot)
CREATE TABLE IF NOT EXISTS matches (
    match_id TEXT PRIMARY KEY,
    patch TEXT NOT NULL,
    queue TEXT NOT NULL,
    tier TEXT NOT NULL,
    region TEXT,
    blue_win INTEGER NOT NULL CHECK (blue_win IN (0, 1))
);

CREATE TABLE IF NOT EXISTS participants (
    match_id TEXT NOT NULL,
    side TEXT NOT NULL CHECK (side IN ('blue', 'red')),
    role TEXT NOT NULL,
    champ TEXT NOT NULL,
    win INTEGER NOT NULL CHECK (win IN (0, 1)),
    PRIMARY KEY (match_id, side, role)
);

CREATE TABLE IF NOT EXISTS bans (
    match_id TEXT NOT NULL,
    side TEXT NOT NULL,
    ban_order INTEGER NOT NULL,
    champ TEXT,
    PRIMARY KEY (match_id, side, ban_order)
);

-- Runtime tables (scorer lookup)
CREATE TABLE IF NOT EXISTS champ_baseline (
    patch TEXT NOT NULL,
    queue TEXT NOT NULL,
    tier TEXT NOT NULL,
    role TEXT NOT NULL,
    champ TEXT NOT NULL,
    games INTEGER NOT NULL,
    wins INTEGER NOT NULL,
    score REAL NOT NULL,
    PRIMARY KEY (patch, queue, tier, role, champ)
);

CREATE TABLE IF NOT EXISTS champ_matchup (
    patch TEXT NOT NULL,
    queue TEXT NOT NULL,
    tier TEXT NOT NULL,
    role TEXT NOT NULL,
    champ TEXT NOT NULL,
    enemy_role TEXT NOT NULL,
    enemy_champ TEXT NOT NULL,
    games INTEGER NOT NULL,
    score REAL NOT NULL,
    PRIMARY KEY (patch, queue, tier, role, champ, enemy_role, enemy_champ)
);

CREATE TABLE IF NOT EXISTS champ_synergy (
    patch TEXT NOT NULL,
    queue TEXT NOT NULL,
    tier TEXT NOT NULL,
    role TEXT NOT NULL,
    champ TEXT NOT NULL,
    ally_role TEXT NOT NULL,
    ally_champ TEXT NOT NULL,
    games INTEGER NOT NULL,
    score REAL NOT NULL,
    PRIMARY KEY (patch, queue, tier, role, champ, ally_role, ally_champ)
);

CREATE TABLE IF NOT EXISTS player_comfort (
    role TEXT NOT NULL,
    champ TEXT NOT NULL,
    games INTEGER NOT NULL,
    wins INTEGER NOT NULL,
    score REAL NOT NULL,
    PRIMARY KEY (role, champ)
);

CREATE TABLE IF NOT EXISTS champ_tags (
    champ TEXT PRIMARY KEY,
    frontline REAL,
    engage REAL,
    peel REAL,
    magic REAL,
    physical REAL,
    range_score REAL,
    scaling REAL,
    cc REAL
);
