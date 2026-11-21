# Nexus Draft

Nexus Draft ships as two separate applications:

- **Windows desktop app**: live League Client API integration, automatic champion select parsing, and the in-game overlay.
- **Hosted web app**: browser-safe manual draft entry with the same recommendation model and Nexus UI style.

The web app cannot read the local League Client API or create a true in-game overlay from a browser. Use the desktop app for live champ select.

## Development

```sh
npm install
npm run dev
```

Run the browser-only web app locally:

```sh
npm run dev:web
```

## Builds

Build the Electron desktop app:

```sh
npm run build
```

Build the Vercel web app:

```sh
npm run build:web
```

Create Windows release artifacts:

```sh
npm run dist:win
```

The Windows build emits installer/portable `.exe` files into `release/`.

## Desktop UX

The desktop app launches **overlay-first**: only the compact overlay is shown, and the full window
stays loaded but hidden (it owns the draft engine that feeds the overlay). Use `☰ Menu` on the
overlay to expand the full window, and `Collapse` in its title bar to go back.

All settings live on the full window's **Setup** page (the overlay's ⚙ opens it): overlay keys,
what the overlay shows in champ select and in game, and the theme. Labels stay short; the `i`
badges explain each control.

Overlay toggle keys default to `Insert` / `F9` / `F10`. Windows refuses a key that another app
already owns, so the overlay shows the key that actually registered — or tells you none did. Rebind
it under **Setup → Overlay → Toggle key**. `Reset overlay` rebuilds the window at a known-visible
position, and `Why can't I see it?` dumps a diagnostic you can paste into a bug report.

**Themes** (Setup → Theme): Midnight (default), Graphite and Emerald. The choice recolors every
window at once (main, overlay and boxes) and is remembered per install.

The overlay sizes its height to its content on both tabs, so it never sits small with a scrollbar
(it only scrolls when the content is taller than the screen). It remembers two spots: where you
leave it in champ select and where you leave it in game.

Main-process logs (including every overlay show/hide/failure) go to
`%APPDATA%/nexusdraft/logs/nexus-draft-main.log` in packaged builds.

## Champ Select Overlay

The overlay opens when champ select starts and closes when it ends (the game starts, or someone
dodges). In game, the peek key or your toggle key brings it back. By default the Draft tab is just
your top 5 picks for your role, each with how much it changes your win chance. Everything else is
opt-in under **Setup → Champ select overlay**: how many picks, more per pick (score, who it beats,
who it pairs with, runes, tips, build), more sections (both teams, your matchups, draft intel,
champion search, coaching), the Draft/Build tabs, data status, hotkey hint, engine settings, the
full tables, and the open/close behavior itself.

Champ select start and end come from the same 400 ms League client poll that feeds the draft. The
overlay closes after about 1.2 s with no session, so one failed request never closes it mid-draft.
To test without League, set `LEAGUE_LOCKFILE` to the lockfile of a mock client on `127.0.0.1` that
answers `/lol-champ-select/v1/session` (404 means no champ select).

## Build Paths And In-Game Help

The overlay has two tabs: **Draft** (champ select picks) and **Build**. It switches to Build by
itself when a game starts and back to Draft afterwards; clicking a tab overrides that until the
next phase change.

- **Build tab, out of game**: build path for your locked champion (or any champion you search):
  starting items, core in buy order, 4th/5th/6th item options with win rates, the six-item end
  state, skill order, runes and summoner spells. The website has the same view at `/builds`
  (`/builds?champion=Ahri` links straight to a champion).
- **Build tab, in game**: the main process polls Riot's Live Client Data API
  (`https://127.0.0.1:2999/liveclientdata/allgamedata`, every 2s in game). The overlay shows the
  next item to buy, the gold you still need after the components you own, what to buy with your
  current gold, your build with owned items ticked, swaps for what the enemy team is building
  (anti-heal into healers, penetration into armor/MR stacking, defense against whoever is fed),
  and the enemy team's items, KDA and damage type. Items an enemy just finished show up as
  **New** buys for three minutes of game time. That API only exposes what the Tab scoreboard already shows; summoner
  names are dropped when the payload is parsed.
- **Peek key** (on by default; Setup → Overlay → Peek key): in a game, hold `Caps Lock` to show the
  overlay on its Build tab and let go to hide it (an overlay you opened yourself stays open).
  `Tab`, `` ` ``, `Mouse 4` and `Mouse 5` also work, and **Toggle** mode makes it press-to-show,
  press-to-hide. The main process polls `GetAsyncKeyState` every 35 ms through
  [koffi](https://koffi.dev) only while a game is running, and only when League's game window is in
  front and Alt/Ctrl/Win are up. It installs no keyboard or mouse hook and never sends keys, so the
  game still gets the key press. Like the overlay itself, it needs Borderless or Windowed mode;
  exclusive fullscreen covers other windows.
- **In-game layout** (Setup → In-game layout): put each in-game section (Next buy, Your build,
  Item swaps, Enemy team) in the main overlay, in a **box**, or hide it. Boxes are small
  always-on-top windows you drag anywhere (up to four). They can stay up all game or show only
  while you peek. `Arrange boxes on screen` shows them outside a game so you can place them. The
  arrows set where the main overlay opens in game. Your overlay toggle key hides and shows
  everything.

Build data comes from U.GG's public stats (world, Emerald+, current patch). `npm run items:update:ugg`
writes three files: the slim engine seed bundled with the draft engine
(`src/shared/data/uggDefaultItemBuildsSeed.json`), the full paths that load when a Build view
opens (`src/shared/data/buildPathsSeed.json`), and a served copy
(`src/renderer/public/data/buildPathsSeed.json`) that installed apps download when it is newer
than what they bundle. The daily `Update public meta data` workflow runs it together with the
Lolalytics meta refresh and only commits when the tests pass. (`items:update:coachless` is an older
alternative source; it only rewrites the slim engine seed.)

To test the in-game view without League, point the app at a mock server:
`NEXUS_LIVE_CLIENT_URL=https://127.0.0.1:29990 npm run dev` (only `127.0.0.1`/`localhost` are accepted).
In dev builds, `NEXUS_PEEK_FAKE_FILE=<path>` replaces the peek key reader with a file: `1` means
the key is held, anything else means released. Packaged builds ignore it.

koffi ships prebuilt binaries, so its install script is marked `false` in `allowScripts`.
`build.files` keeps only `win32_x64/koffi.node` (unpacked from the asar) out of its 18
platform builds.

## Release Flow

The version only changes when you release. Pushing to `main` leaves it alone.

1. Set the release number: `npm run release:bump-version -- --set 5.1.0` (`-- --count 1` picks the
   next number instead). It updates `package.json`, `package-lock.json`, the app's build label and
   the website's download and build labels.
2. Run `npm run build` and `npm run build:web`.
3. Run `npm run dist:win` to produce the desktop `.exe` artifacts.
4. Run `npm run release:stage-web` to copy `latest.yml` + the installer/portable into
   `src/renderer/public/downloads/`. This also prunes superseded builds and writes a
   `downloads.json` manifest.
5. Upload the desktop artifacts to a GitHub Release.
6. Include the [VirusTotal safety scan](https://www.virustotal.com/gui/file-analysis/OWQyYjU0YWQwNzU0NmE5ZTgzY2QwN2QxMWQyZWZjYzc6MTc4MDE2NTI4Mg==) in the release notes.
7. Push `main`; Vercel builds the web app from `vercel.json` using `npm run build:web`.

> `src/renderer/public/downloads/` is served by Vercel, so both exes (~165 MB total) ship in every
> deploy. If that becomes a problem, host the binaries on the GitHub Release and keep only
> `latest.yml` here for the updater feed.

### Windows build notes

- npm 11 blocks install scripts by default. After `npm ci`, run
  `npm approve-scripts electron esbuild wasm-pack` then `npm rebuild electron esbuild`, or the
  Electron binary is never downloaded and packaging fails.
- `electron-builder` extracts a `winCodeSign` bundle containing macOS symlinks, which needs
  Administrator or Developer Mode. Without either, pre-extract it once:

```sh
7za x "$LOCALAPPDATA/electron-builder/Cache/winCodeSign/winCodeSign-2.6.0.7z" -o"$LOCALAPPDATA/electron-builder/Cache/winCodeSign/winCodeSign-2.6.0" -x'!darwin'
```

## Feature Split

| Capability | Desktop `.exe` | Web app |
| --- | --- | --- |
| Manual draft recommendations | Yes | Yes |
| Shared recommendation model | Yes | Yes |
| Live League Client API | Yes | No |
| In-game overlay | Yes | No |
| Vercel hosting | No | Yes |

The web app includes a small public visitor counter powered by [Visitor Counter API](https://visitor.6developer.com/api-docs).

## Vercel Settings

- Framework preset: Vite
- Build command: `npm run build:web`
- Output directory: `dist/web`
- Install command: `npm ci`
- Optional Riot mastery import env var: `RIOT_API_KEY`

For the desktop app, put `RIOT_API_KEY=...` in the project `.env` during development or next to the packaged `.exe` for local Riot mastery imports.
