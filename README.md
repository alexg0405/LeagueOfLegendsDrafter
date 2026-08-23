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

Overlay toggle keys default to `Insert` / `F9` / `F10`. Windows refuses a key that another app
already owns, so the overlay shows the key that actually registered — or tells you none did. Rebind
it under **Overlay → Toggle key**. `Reset overlay` rebuilds the window at a known-visible position,
and `Why can't I see it?` dumps a diagnostic you can paste into a bug report.

Main-process logs (including every overlay show/hide/failure) go to
`%APPDATA%/nexusdraft/logs/nexus-draft-main.log` in packaged builds.

## Release Flow

1. Run `npm run build` and `npm run build:web`.
2. Run `npm run dist:win` to produce the desktop `.exe` artifacts.
3. Run `npm run release:stage-web` to copy `latest.yml` + the installer/portable into
   `src/renderer/public/downloads/`. This also prunes superseded builds and writes a
   `downloads.json` manifest.
4. Upload the desktop artifacts to a GitHub Release.
5. Include the [VirusTotal safety scan](https://www.virustotal.com/gui/file-analysis/OWQyYjU0YWQwNzU0NmE5ZTgzY2QwN2QxMWQyZWZjYzc6MTc4MDE2NTI4Mg==) in the release notes.
6. Push `main`; Vercel builds the web app from `vercel.json` using `npm run build:web`.

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
