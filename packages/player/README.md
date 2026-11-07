# experiential-manual-player (working name)

Components for viewing an experiential operation manual (the JSON of [`@shuji-bonji/experiential-manual-model`](https://www.npmjs.com/package/@shuji-bonji/experiential-manual-model)). The product name is not decided yet, so this package is not published (`private: true`).

[日本語](./README.ja.md)

## What is here now

### Runtime (`src/runtime/`)

It reads a `Manual` and keeps track of "where the reader is". It is plain TypeScript with no dependency on Svelte, so the CLI `build` and a future WebMCP can run the same state transitions without rendering anything.

| Module | Role |
|---|---|
| `scope` | Scope selection (`{ model: 'MV-50' }`) and filtering of topics, steps, blocks and screens. `parseScopeSelection('model=MV-50')` reads the `scope` attribute of the Web Component |
| `lookup` | Finds a topic, screen or step by id. `resolveTarget(manual, to)` resolves `Transition.to` to either a screen or a step |
| `flow` | Screen flow (P-1). `createFlow(manual, topicId)` opens it; `press(hotspotId)` moves on; `back()` / `restart()` go back. The screens visited so far are in `trail` |
| `procedure` | Procedure (P-2). Numbers come from `numberSteps` of the model; steps hidden by the scope are renumbered. `next()` / `prev()` / `choose(i)` walk one step at a time |
| `troubleshooting` | Troubleshooting (P-4). `answer(i)` answers a question; when a resolution is reached it is in `resolution`. `back()` returns to the previous question |
| `store` | A small value with `subscribe`. It follows the Svelte store contract, so Svelte can read it as `$flow` |
| `assets` | Asset URL (`source.data`, otherwise `path` resolved against the URL of the manual JSON) and size (`width` / `height`) |

Each runtime only reads the `Manual` and never changes it.

```ts
import { createFlow } from '@shuji-bonji/experiential-manual-player/runtime';

const flow = createFlow(manual, 'topic-buy');
flow.subscribe((state) => console.log(state.screen?.caption, state.trail));
flow.press('hs-top-transfer'); // STEP1 → STEP2
flow.back();                   // STEP1
```

### Components (`src/components/`, Svelte 5)

| Component | Role |
|---|---|
| `Stage` | The screen image with its hotspots. The SVG viewBox matches the image pixels, so `coords` are drawn as they are. Outlines are hidden by default and appear on hover or focus; `hints` shows all of them. Tab moves between hotspots, Enter or Space presses one. For the editor it offers `overlay` (a layer in the same coordinate system), `toImage(x, y)` / `toScreen(x, y)` and `mode="edit"` (pressing selects instead of navigating, via `onselect`) |
| `ScreenPane` | The side pane of P-1: caption, description, admonitions and the list of places to press (buttons) |
| `ScreenFlow` | P-1: breadcrumb of visited screens, Stage, ScreenPane, back / restart / hints. The state lives in the runtime's `createFlow`. When a target is a step, `onleave` reports it |
| `TopicView` | Switches on the topic `kind`: `screenFlow` → ScreenFlow, `procedure` → ProcedureView, `description` → BlockView, `troubleshooting` → FaultTree |
| `ProcedureView` | P-2. A numbered list and a one-at-a-time mode. `expected` is shown with "→", admonitions and figures right under the step. `Step.next` branches appear as choices under the current step; a target in another topic is reported through `onleave`. State lives in the runtime's `createProcedure` |
| `BlockView` | P-3. Renders `blocks` as headings, paragraphs, lists, tables, figures and admonitions, top to bottom. `section` children recurse. Blocks hidden by the scope are removed first with `applicableBlocks` |
| `FaultTree` | P-4. Walks questions and answers top to bottom, keeping answered questions dimmed. At a resolution it shows the text and figures; if the target is another topic it offers a button to open it. State lives in the runtime's `createTroubleshooting` |
| `Figure` | A figure (`assetRef`). Images start small and enlarge on click; when the id points to a `Screen`, that screen opens in a `Stage` (linking procedures with screen flows). Other asset kinds show only their kind and file name |
| `Admonitions` | Warnings, cautions and notes (shared by P-1, P-2 and P-3) |
| `Frame` | P-0: header with title, version, scope selectors and glossary; the table of contents; the selected topic. `chrome="none"` renders only the content. The default `--em-*` color tokens (light and dark) are defined here and can be overridden from outside |

Texts live in `text.ts` in Japanese and English under the same keys (`lang`).

### Web Component (`src/element/`)

`npm run build` emits `dist/element/experiential-manual.js` (one ES module). Loading it registers `<experiential-manual>`. Styles are contained in the shadow DOM.

```html
<script type="module" src="experiential-manual.js"></script>
<experiential-manual src="./help/manual.json" topic="topic-buy" hints></experiential-manual>
```

| Attribute | Meaning |
|---|---|
| `src` | URL of the manual JSON. Relative image paths are resolved against it |
| `topic` | Topic id to open first; defaults to the first topic |
| `screen` | Screen id to open first |
| `scope` | Initial scope, as `model=MV-50;site=outdoor` |
| `hints` | Show hotspot outlines from the start |
| `chrome="none"` | Hide the header and table of contents and show only the topic |
| `lang` | `ja` (default) or `en` |

From JavaScript, `element.manual = manualObject` passes a manual directly (it takes precedence over `src`).

`demo/index.html` places the ticket-machine example in several ways (with frame, content only, procedure / description / troubleshooting, English with an initial scope). After `npm run build -w packages/player`, serve `packages/player` statically and open `/demo/` (for example `npx serve packages/player`).

## Not here yet

The search in P-0, the sample input field for `input` hotspots in P-1, and rendering of 3D and video assets. The order is in section 6 of [docs/design/player-and-editor.md](../../docs/design/player-and-editor.md).

## Commands

Run from the repository root (npm workspaces).

| Command | What it does |
|---|---|
| `npm run check:player` | svelte-check over the runtime, components and Web Component |
| `npm run test:player` | Vitest for the runtime, using the ticket-machine example (`test/fixtures/kenbaiki.manual.json`) |
| `npm run build -w packages/player` | `tsc` emits the runtime to `dist/`, `vite build` emits the Web Component to `dist/element/` |
