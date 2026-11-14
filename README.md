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
| `npm run test:e2e` | Builds, then runs the main flows in Playwright (Chromium) from `e2e/editor.spec.ts`: open → draw → connect → play → save, the map / check / assets drawers on the 2021 JSON, and adding a step, a question and a block. Run `npx playwright install chromium` once first |
| `npm run build` | Static build into `build/` (adapter-static, SPA, PWA) |
| `npm run make:help` | Builds, then regenerates the experiential manual opened by "Help" in the top bar (`static/help/help.manual.json` and the screen images) from the editor's own screens (`scripts/make-help.mjs`, Playwright). Run it after changing the UI |
| `npm run preview` | Serves `build/` locally |

To build for GitHub Pages, set the repository name: `BASE_PATH=/manual-editor npm run build`.

## What it does

- **Open / save** (the "File" menu in the top bar): a manual is saved as one file (`<title>.emanual`) that also holds its images; opening that file restores the manual with its images. Where the File System Access API is available, saving overwrites the file you opened or saved before (on a local disk or in a synced folder). Elsewhere it uses a file input and a download. "Open" checks that the file is a zip and that it contains only `manual.json` and `assets/`; otherwise it reports the reason and does not open it.
- **Export as HTML**: writes the manual as a single HTML file with the player and the images embedded. Whoever receives it only has to open it in a browser (it works from `file://` too). This is a simple way to hand a manual over for viewing; the editor cannot open the HTML again. To let someone edit, give them the `.emanual` file.
- **Import from an extracted folder**: loads a folder made by extracting a manual file and editing it by hand, or a folder written by a script (read only; nothing is written back to the folder). Images outside `assets/` are moved under `assets/`, and files the manual does not refer to are not brought in. A folder with a 2021 JSON is also imported here, converted with `fromLegacyJson`.
- **Topics**: add, rename, reorder, delete, and choose the kind (`description` / `procedure` / `screenFlow` / `troubleshooting`).
- **Screen editing** (`screenFlow`): three columns, with the structure tree on the left, the stage of the viewer components (player) in the middle and the inspector on the right. Add screenshots and drag on the image to draw rectangle, circle or polygon hotspots. A selected hotspot can be moved by dragging, reshaped with its handles and nudged with the arrow keys (1 px, 10 px with Shift). Set the label, the action (press / input / read), the target (a screen or a step; "add a new screen as the target" is available) and the condition. When a replaced image has a different size, the editor asks whether to scale the coordinates. Coordinates are stored in pixels of the original image.
- **Procedure editing** (`procedure`): the same list as the viewer's procedure view, with the text itself as the input. Enter adds the next step, Tab / Shift+Tab change the level, Backspace on an empty step removes it, and Alt+↑↓ reorders. The expected result and warning / caution / note are written inside the step row, and figures are attached by dragging cards from the "Assets" drawer onto a step. The target hotspot, branches (condition and destination) and scopes are set in the inspector.
- **Description editing** (`description`): add blocks of six kinds (section, paragraph, list, table, figure, admonition) and write them in place. Blocks can also go inside a section. A figure takes an asset from a drop-down, or a dropped asset card or image file.
- **Troubleshooting editing** (`troubleshooting`): write the question and the answers inside the step row and choose a destination for each answer (a step of this Topic, a screen, or a step of another Topic). A step without a question is a resolution.
- **Help** (top bar): opens the editor's own usage as an experiential manual, with four Topics (the screens as a screen flow, making a screen flow as a procedure, what gets saved as a description, and troubleshooting). The screen images and the hotspot coordinates are generated from the editor's own screens by `scripts/make-help.mjs`. "Open this help as an example" loads the help JSON into the editor so you can look inside, and the bundled small example (the ticket machine, with placeholder images) is also opened from here. This is the first real example of an experiential manual.
- **Assets** (bottom drawer): lists `Manual.assets` as thumbnails with the number of screens and steps that use each one, and marks unused assets and assets without an image. Add images by choosing files, by adding a folder, by dropping them on the drawer or the stage, or by pasting a screenshot (Ctrl/⌘+V; it becomes a new screen when a screen-flow Topic is selected). The image width and height are read when an image is added and written to `AssetFile.width` / `height`. Selecting an asset opens it in the inspector: alt text, credit, where it is used, replace, mask (fills the rectangles you draw and does not keep the original image) and delete.
- **Transition map** (bottom drawer): the screens of a Topic as nodes and `Hotspot.transition` as edges. The layout is a layered layout of our own, from a breadth-first search starting at the start screen; unreachable screens and transitions without a target are shown in red. Transitions from many screens back to the same screen ("cancel → STEP1") are shown as labels instead of lines. Clicking a node selects that screen.
- **Check** (bottom drawer): lists the errors and warnings of `validateManual` grouped by Topic, with the location as names ("screen › hotspot") and the common messages in Japanese. Selecting an item moves to the Topic, screen, step or asset; unreachable screens have a "show on map" button. Saving reports remaining errors without blocking the save.
- **Edit | Play**: switched on the same stage. Play is the viewer component itself (`packages/player`): pressing a hotspot moves to its target, with back and restart. The screen reached while playing is selected when you switch back to edit. Procedure, description and troubleshooting topics can be played too.
- **Undo / redo**.
- **Notices**: a notice such as "Saved" appears in a corner of the screen and disappears after 5 seconds (it stays while the pointer is over it). Warnings and errors appear in a bar at the top and stay until you press "Close".
- **Picks up where you left off**: the manual you are editing is kept in a workspace inside the browser (Origin Private File System) as `manual.json` plus `assets/`. `manual.json` is written after each edit and images are written when you add them, so closing the tab does not lose your work. Pasted and masked images are kept too.

## What it does not do

> [!IMPORTANT]
> The app does not export S1000D. Rename the saved file (`.emanual`) to `.zip`, extract it, and pass the `manual.json` inside to the Skill `experience-to-s1000d` or to the `convert_manual` tool of writer-mcp.

- Splitting pasted Markdown into blocks, merged table cells, and nesting blocks more than one level (a section inside a section).
- Reordering the tree by dragging (use the ↑↓ buttons), and saving node positions in the transition map (the layout is computed every time).
- Opening a manual JSON on its own with "Open". Put the JSON in a folder and use "Import from an extracted folder".
- Reading ZIP64 (4 GB or larger) and encrypted zip files.
- AI assistance, login, sharing and server-side storage.

## How images are stored

A manual file (`.emanual`) is a zip that holds `manual.json` and the image folder `assets/`. Rename the extension to `.zip` to extract it. Images you add are copied into `assets/` in the browser workspace, and `Asset.source.path` holds the path relative to `manual.json` (`assets/01-start.png`). The saved file contains only the images the manual uses (images removed from the asset list are left out). For an asset whose image is missing, assign the image file in the "Assets" drawer at the bottom ("Assign images in bulk" matches them by file name). The manual's title, version and scopes (`Scope`) are edited in the inspector after selecting "Manual" at the top of the structure tree.

## Data stays in your browser

> [!NOTE]
> The app has no server. Files are read and written in your browser only, and nothing is uploaded. The browser keeps the manual you are editing (`manual.json` and its images) in the workspace, and a note in `localStorage` of which manual was open. When you switch to another manual with "New" or "Open", the previous one is removed from the workspace. In a browser that cannot use the workspace, the app says so and asks before you close the tab.

## Technology

SvelteKit 2 and Svelte 5 (runes), TypeScript, `@sveltejs/adapter-static`, `@vite-pwa/sveltekit`. Plain CSS with light and dark tokens in `src/app.css`. UI texts are collected in `src/lib/i18n.ts`.

| Path | Role |
|---|---|
| `src/lib/ops.ts` | Pure editing functions (`addTopic`, `addHotspot`, `setTransition`, ...) |
| `src/lib/io.ts` | Parse and serialize JSON, access to the user's files |
| `src/lib/zip.ts` | Reads and writes zip (stored when writing; stored and deflate when reading) |
| `src/lib/export-html.ts` | Export as a single HTML file (embeds the player and the manual) |
| `src/lib/bundle.ts` | Checks the layout of a manual file, imports from a folder, moves image paths under `assets/`, and packs a manual into a zip |
| `src/lib/workspace.ts` | Reads and writes the browser workspace (`manual.json` and images of the manual being edited) |
| `src/lib/issues.ts` | Maps a `validateManual` path to a place in the UI |
| `src/lib/state.svelte.ts` | The store that holds one `Manual` |
| `src/lib/components/` | UI panels |

## Repository layout

| Path | Contents |
|---|---|
| root (`src/`) | The editor (SvelteKit). It draws on top of the `Stage` of `packages/player` and uses `ScreenFlow` as is for the play mode (E-0 and E-1 of section 3 of the design document) |
| `packages/player` | The viewer components (working name experiential-manual-player). The runtime (no Svelte dependency: transitions, history, scope filtering, step numbering, troubleshooting dialogue), the components (Stage, P-1, P-0; Svelte 5), the `<experiential-manual>` Web Component build and `demo/`. P-2 to P-4 are included. Check it with `npm run test:player` / `npm run check:player`. See [packages/player/README.md](./packages/player/README.md) |

This is an npm workspace. Run `npm install` once at the root.

## License

MIT

## Design documents

This repository is the centre of the experiential-manual product project (player, editor and cli). The foundation (s1000d-core, the MCP servers, the Skills and experiential-manual-model) lives in [s1000d-stack](https://github.com/shuji-bonji/s1000d-stack); this product was split off as a separate project on 2026-11-07 (decision D-29 of s1000d-stack). The documents are written in Japanese.

| Document | Content |
|---|---|
| [docs/notes/editor-and-viewer-study.md](./docs/notes/editor-and-viewer-study.md) | Study of which tools to build (users, candidate tools, structure, choice of example material, open decisions) |
| [docs/design/player-and-editor.md](./docs/design/player-and-editor.md) | Draft screen design: build the player first and layer the editor on it as an editing mode |
