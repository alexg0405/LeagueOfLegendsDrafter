# Nexus Draft

Nexus Draft ships as two separate applications:

- **Windows desktop app**: live League Client API integration, automatic champion select parsing, and the in-game overlay.
- **Hosted web app**: browser-safe manual draft entry with the same recommendation model and Nexus UI style.

The web app cannot read the local League Client API or create a true in-game overlay from GitHub Pages. Use the desktop app for live champ select.

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

Build the GitHub Pages web app:

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
4. Push `main`; `.github/workflows/pages.yml` builds and deploys the web app to GitHub Pages.

## Feature Split

| Capability | Desktop `.exe` | Web app |
| --- | --- | --- |
| Manual draft recommendations | Yes | Yes |
| Shared recommendation model | Yes | Yes |
| Live League Client API | Yes | No |
| In-game overlay | Yes | No |
| GitHub Pages hosting | No | Yes |
