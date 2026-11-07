# experiential-manual-player（仮称）

体験型の操作マニュアル（[`@shuji-bonji/experiential-manual-model`](https://www.npmjs.com/package/@shuji-bonji/experiential-manual-model) の JSON）を見るための部品です。製品名は決まっていないので、npm には出していません（`private: true`）。

[English](./README.md)

## いま入っているもの

`src/runtime/` の **runtime** だけです。`Manual` を読んで「今どこにいるか」を持つ TypeScript で、Svelte に依存しません。CLI の `build` や、将来の WebMCP から、画面を描かずに同じ状態遷移を使うためです。

| モジュール | 役割 |
|---|---|
| `scope` | 適用範囲の選択（`{ model: 'MV-50' }` の形）と、Topic・Step・Block・Screen の絞り込み。`parseScopeSelection('model=MV-50')` で Web Components の `scope` 属性を読みます |
| `lookup` | id から Topic・Screen・Step を探します。`resolveTarget(manual, to)` は `Transition.to` を画面か手順として返します |
| `flow` | 画面遷移（P-1）。`createFlow(manual, topicId)` で開き、`press(hotspotId)` で進み、`back()` / `restart()` で戻ります。通った画面の列は `trail` です |
| `procedure` | 手順（P-2）。番号は model の `numberSteps` で付け、適用範囲で消えた手順は番号を詰めます。`next()` / `prev()` / `choose(i)` で 1 つずつ進めます |
| `troubleshooting` | 困ったとき（P-4）。`answer(i)` で問いに答え、対処に着くと `resolution` に行き先が入ります。`back()` で 1 つ前の問いに戻ります |
| `store` | `subscribe` を持つ小さな値。Svelte の store contract に合わせてあるので、Svelte からは `$flow` のように読めます |

各 runtime は `Manual` を読むだけで書き換えません。

```ts
import { createFlow } from '@shuji-bonji/experiential-manual-player/runtime';

const flow = createFlow(manual, 'topic-buy');
flow.subscribe((state) => console.log(state.screen?.caption, state.trail));
flow.press('hs-top-transfer'); // STEP1 → STEP2
flow.back();                   // STEP1
```

## まだ無いもの

部品（Stage・右の欄・外枠）と Web Components のビルドです。順序は [docs/design/player-and-editor.md](../../docs/design/player-and-editor.md) の 6 節にあります。

## コマンド

リポジトリのルートから実行します（npm workspaces）。

| コマンド | 内容 |
|---|---|
| `npm run check:player` | `tsc --noEmit` |
| `npm run test:player` | Vitest。券売機の例（`test/fixtures/kenbaiki.manual.json`）で確かめます |
| `npm run build -w packages/player` | `dist/` に出力します |
