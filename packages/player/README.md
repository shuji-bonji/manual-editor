# experiential-manual-player (working name)

Components for viewing an experiential operation manual (the JSON of [`@shuji-bonji/experiential-manual-model`](https://www.npmjs.com/package/@shuji-bonji/experiential-manual-model)). The product name is not decided yet, so this package is not published (`private: true`).

[日本語](./README.ja.md)

## What is here now

Only the **runtime** in `src/runtime/`. It reads a `Manual` and keeps track of "where the reader is". It is plain TypeScript with no dependency on Svelte, so the CLI `build` and a future WebMCP can run the same state transitions without rendering anything.

| Module | Role |
|---|---|
| `scope` | Scope selection (`{ model: 'MV-50' }`) and filtering of topics, steps, blocks and screens. `parseScopeSelection('model=MV-50')` reads the `scope` attribute of the Web Component |
| `lookup` | Finds a topic, screen or step by id. `resolveTarget(manual, to)` resolves `Transition.to` to either a screen or a step |
| `flow` | Screen flow (P-1). `createFlow(manual, topicId)` opens it; `press(hotspotId)` moves on; `back()` / `restart()` go back. The screens visited so far are in `trail` |
| `procedure` | Procedure (P-2). Numbers come from `numberSteps` of the model; steps hidden by the scope are renumbered. `next()` / `prev()` / `choose(i)` walk one step at a time |
| `troubleshooting` | Troubleshooting (P-4). `answer(i)` answers a question; when a resolution is reached it is in `resolution`. `back()` returns to the previous question |
| `store` | A small value with `subscribe`. It follows the Svelte store contract, so Svelte can read it as `$flow` |

Each runtime only reads the `Manual` and never changes it.

```ts
import { createFlow } from '@shuji-bonji/experiential-manual-player/runtime';

const flow = createFlow(manual, 'topic-buy');
flow.subscribe((state) => console.log(state.screen?.caption, state.trail));
flow.press('hs-top-transfer'); // STEP1 → STEP2
flow.back();                   // STEP1
```

## Not here yet

The components (Stage, side pane, outer frame) and the Web Components build. The order is in section 6 of [docs/design/player-and-editor.md](../../docs/design/player-and-editor.md).

## Commands

Run from the repository root (npm workspaces).

| Command | What it does |
|---|---|
| `npm run check:player` | `tsc --noEmit` |
| `npm run test:player` | Vitest, using the ticket-machine example (`test/fixtures/kenbaiki.manual.json`) |
| `npm run build -w packages/player` | Emits to `dist/` |
