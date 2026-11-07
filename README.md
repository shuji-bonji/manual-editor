# manual-editor (working name)

> [!NOTE]
> "manual-editor" is a working name. The product name has not been decided yet.

A prototype web app for building experiential operation manuals on screen. An experiential manual is a set of screenshots with clickable areas (hotspots); pressing a hotspot moves to the next screen. This is a rebuild of the 2021 work `experience_based_operation_explanation`, now with an editing UI.

The app reads and writes the JSON of [`@shuji-bonji/experiential-manual-model`](https://www.npmjs.com/package/@shuji-bonji/experiential-manual-model) and uses its types and `validateManual` as they are.

[日本語](./README.ja.md)

## Getting started

```sh
npm install && npm run dev
```

Other commands:

| Command | What it does |
|---|---|
| `npm run check` | Type check with svelte-check |
| `npm test` | Unit tests with Vitest |
| `npm run build` | Static build into `build/` (adapter-static, SPA, PWA) |
| `npm run preview` | Serves `build/` locally |

To build for GitHub Pages, set the repository name: `BASE_PATH=/manual-editor npm run build`.

## What it does

- **Open / save**: opens a manual-model JSON and saves it (File System Access API where available, otherwise file input and download). A 2021 JSON is converted with `fromLegacyJson`, and its warnings are shown.
- **Topics**: add, rename, reorder, delete, and choose the kind (`description` / `procedure` / `screenFlow` / `troubleshooting`).
- **Screen editor** (`screenFlow`): add screenshots, drag on the image to draw rectangle or circle hotspots, set the label, the action (press / input / read) and the target screen. Coordinates are stored in pixels of the original image.
- **Steps, admonitions, scopes** (`procedure`): nested steps, expected results, warning / caution / note, and `Scope` with `scopeRefs`.
- **Check**: lists the errors and warnings of `validateManual`. Selecting an item moves to the Topic, screen or step.
- **Experience view**: runs a `screenFlow` from its start screen. Pressing a hotspot moves to its target; back and restart are available.
- **Undo / redo** and an automatic draft in `localStorage`.

## What it does not do

> [!IMPORTANT]
> The app does not export S1000D. Pass the saved JSON to the Skill `experience-to-s1000d` or to the `convert_manual` tool of writer-mcp.

- Editing the body blocks of `description` Topics (the loaded blocks are kept as they are).
- Editing `answers` of `troubleshooting` steps, and moving or reshaping existing hotspots by dragging (delete and redraw, or edit the numbers).
- Drawing polygons (polygons read from a JSON are shown and kept).
- AI assistance, login, sharing and server-side storage.

## How images are stored

The JSON does not contain image data by default. `Asset.source.path` holds only the file name, and the image files are kept separately. After opening a JSON, assign the image files in the "Scopes and assets" tab ("Assign images in bulk" matches them by file name). The "Embed images in JSON" option writes each image as a data URL into `source.path` instead; this makes the JSON large.

## Data stays in your browser

> [!NOTE]
> The app has no server. Files are read and written in your browser only, and nothing is uploaded. The only thing kept by the browser is the draft in `localStorage` (without images), which you can discard from the banner.

## Technology

SvelteKit 2 and Svelte 5 (runes), TypeScript, `@sveltejs/adapter-static`, `@vite-pwa/sveltekit`. Plain CSS with light and dark tokens in `src/app.css`. UI texts are collected in `src/lib/i18n.ts`.

| Path | Role |
|---|---|
| `src/lib/ops.ts` | Pure editing functions (`addTopic`, `addHotspot`, `setTransition`, ...) |
| `src/lib/io.ts` | Parse and serialize JSON, draft, file access |
| `src/lib/issues.ts` | Maps a `validateManual` path to a place in the UI |
| `src/lib/state.svelte.ts` | The store that holds one `Manual` |
| `src/lib/components/` | UI panels |

## License

MIT

## Design documents

This repository is the centre of the experiential-manual product project (player, editor and cli). The foundation (s1000d-core, the MCP servers, the Skills and experiential-manual-model) lives in [s1000d-stack](https://github.com/shuji-bonji/s1000d-stack); this product was split off as a separate project on 2026-11-07 (decision D-29 of s1000d-stack). The documents are written in Japanese.

| Document | Content |
|---|---|
| [docs/notes/editor-and-viewer-study.md](./docs/notes/editor-and-viewer-study.md) | Study of which tools to build (users, candidate tools, structure, choice of example material, open decisions) |
| [docs/design/player-and-editor.md](./docs/design/player-and-editor.md) | Draft screen design: build the player first and layer the editor on it as an editing mode |
