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
- **Screen editing** (`screenFlow`): three columns, with the structure tree on the left, the stage of the viewer components (player) in the middle and the inspector on the right. Add screenshots and drag on the image to draw rectangle, circle or polygon hotspots. A selected hotspot can be moved by dragging, reshaped with its handles and nudged with the arrow keys (1 px, 10 px with Shift). Set the label, the action (press / input / read), the target (a screen or a step; "add a new screen as the target" is available) and the condition. When a replaced image has a different size, the editor asks whether to scale the coordinates. Coordinates are stored in pixels of the original image.
- **Steps, admonitions, scopes** (`procedure`): nested steps, expected results, warning / caution / note, and `Scope` with `scopeRefs`.
- **Assets** (bottom drawer): lists `Manual.assets` as thumbnails with the number of screens and steps that use each one, and marks unused assets and assets without an image. Add images by choosing files, by adding a folder, by dropping them on the drawer or the stage, or by pasting a screenshot (Ctrl/⌘+V; it becomes a new screen when a screen-flow Topic is selected). The image width and height are read when an image is added and written to `AssetFile.width` / `height`. Selecting an asset opens it in the inspector: alt text, credit, where it is used, replace, mask (fills the rectangles you draw and does not keep the original image) and delete.
- **Transition map** (bottom drawer): the screens of a Topic as nodes and `Hotspot.transition` as edges. The layout is a layered layout of our own, from a breadth-first search starting at the start screen; unreachable screens and transitions without a target are shown in red. Transitions from many screens back to the same screen ("cancel → STEP1") are shown as labels instead of lines. Clicking a node selects that screen.
- **Check** (bottom drawer): lists the errors and warnings of `validateManual` grouped by Topic, with the location as names ("screen › hotspot") and the common messages in Japanese. Selecting an item moves to the Topic, screen, step or asset; unreachable screens have a "show on map" button. Saving reports remaining errors without blocking the save.
- **Edit | Play**: switched on the same stage. Play is the viewer component itself (`packages/player`): pressing a hotspot moves to its target, with back and restart. The screen reached while playing is selected when you switch back to edit. Procedure, description and troubleshooting topics can be played too.
- **Undo / redo** and an automatic draft in `localStorage`.

## What it does not do

> [!IMPORTANT]
> The app does not export S1000D. Pass the saved JSON to the Skill `experience-to-s1000d` or to the `convert_manual` tool of writer-mcp.

- Editing the body blocks of `description` Topics (the loaded blocks are kept as they are).
- Editing `answers` of `troubleshooting` steps.
- Reordering the tree by dragging (use the ↑↓ buttons), and saving node positions in the transition map (the layout is computed every time).
- AI assistance, login, sharing and server-side storage.

## How images are stored

The JSON does not contain image data by default. `Asset.source.path` holds only the file name, and the image files are kept separately. After opening a JSON, assign the image files in the "Assets" drawer at the bottom ("Assign images in bulk" matches them by file name). The manual's title, version and scopes (`Scope`) are edited in the inspector after selecting "Manual" at the top of the structure tree. The "Embed images in JSON" option writes each image as a data URL into `source.path` instead; this makes the JSON large.

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

## Repository layout

| Path | Contents |
|---|---|
| root (`src/`) | The editor (SvelteKit). It draws on top of the `Stage` of `packages/player` and uses `ScreenFlow` as is for the play mode (E-0 and E-1 of section 3 of the design document) |
| `packages/player` | The viewer components (working name experiential-manual-player). The runtime (no Svelte dependency: transitions, history, scope filtering, step numbering, troubleshooting dialogue), the components (Stage, P-1, P-0; Svelte 5), the `<experiential-manual>` Web Component build and `demo/`. P-2 to P-4 are not there yet. Check it with `npm run test:player` / `npm run check:player`. See [packages/player/README.md](./packages/player/README.md) |

This is an npm workspace. Run `npm install` once at the root.

## License

MIT

## Design documents

This repository is the centre of the experiential-manual product project (player, editor and cli). The foundation (s1000d-core, the MCP servers, the Skills and experiential-manual-model) lives in [s1000d-stack](https://github.com/shuji-bonji/s1000d-stack); this product was split off as a separate project on 2026-11-07 (decision D-29 of s1000d-stack). The documents are written in Japanese.

| Document | Content |
|---|---|
| [docs/notes/editor-and-viewer-study.md](./docs/notes/editor-and-viewer-study.md) | Study of which tools to build (users, candidate tools, structure, choice of example material, open decisions) |
| [docs/design/player-and-editor.md](./docs/design/player-and-editor.md) | Draft screen design: build the player first and layer the editor on it as an editing mode |
