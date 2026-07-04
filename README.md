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

## Release Flow

1. Run `npm run build` and `npm run build:web`.
2. Run `npm run dist:win` to produce the desktop `.exe` artifacts.
3. Upload the desktop artifacts to a GitHub Release.
4. Include the [VirusTotal safety scan](https://www.virustotal.com/gui/file-analysis/OWQyYjU0YWQwNzU0NmE5ZTgzY2QwN2QxMWQyZWZjYzc6MTc4MDE2NTI4Mg==) in the release notes.
5. Push `main`; Vercel builds the web app from `vercel.json` using `npm run build:web`.

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
