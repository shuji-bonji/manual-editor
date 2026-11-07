# experiential-manual-player（仮称）

体験型の操作マニュアル（[`@shuji-bonji/experiential-manual-model`](https://www.npmjs.com/package/@shuji-bonji/experiential-manual-model) の JSON）を見るための部品です。製品名は決まっていないので、npm には出していません（`private: true`）。

[English](./README.md)

## いま入っているもの

### runtime（`src/runtime/`）

`Manual` を読んで「今どこにいるか」を持つ TypeScript で、Svelte に依存しません。CLI の `build` や、将来の WebMCP から、画面を描かずに同じ状態遷移を使うためです。

| モジュール | 役割 |
|---|---|
| `scope` | 適用範囲の選択（`{ model: 'MV-50' }` の形）と、Topic・Step・Block・Screen の絞り込み。`parseScopeSelection('model=MV-50')` で Web Components の `scope` 属性を読みます |
| `lookup` | id から Topic・Screen・Step を探します。`resolveTarget(manual, to)` は `Transition.to` を画面か手順として返します |
| `flow` | 画面遷移（P-1）。`createFlow(manual, topicId)` で開き、`press(hotspotId)` で進み、`back()` / `restart()` で戻ります。通った画面の列は `trail` です |
| `procedure` | 手順（P-2）。番号は model の `numberSteps` で付け、適用範囲で消えた手順は番号を詰めます。`next()` / `prev()` / `choose(i)` で 1 つずつ進めます |
| `troubleshooting` | 困ったとき（P-4）。`answer(i)` で問いに答え、対処に着くと `resolution` に行き先が入ります。`back()` で 1 つ前の問いに戻ります |
| `store` | `subscribe` を持つ小さな値。Svelte の store contract に合わせてあるので、Svelte からは `$flow` のように読めます |
| `assets` | 素材の URL（`source.data`、無ければ `path` を Manual の JSON の URL からの相対で解決）と大きさ（`width` / `height`） |

各 runtime は `Manual` を読むだけで書き換えません。

```ts
import { createFlow } from '@shuji-bonji/experiential-manual-player/runtime';

const flow = createFlow(manual, 'topic-buy');
flow.subscribe((state) => console.log(state.screen?.caption, state.trail));
flow.press('hs-top-transfer'); // STEP1 → STEP2
flow.back();                   // STEP1
```

### 部品（`src/components/`、Svelte 5）

| 部品 | 役割 |
|---|---|
| `Stage` | 画面の画像と、その上のホットスポット。SVG の viewBox を画像の画素に合わせるので、`coords` をそのまま描けます。既定では枠は見えず、ホバーかフォーカスで出ます。`hints` で全部の枠を出します。Tab で順に移り、Enter か Space で押せます。editor 向けに `overlay`（同じ座標系で描く層）、`toImage(x, y)` / `toScreen(x, y)`、`mode="edit"`（押すと遷移ではなく `onselect`）を持ちます |
| `ScreenPane` | P-1 の右の欄。画面の名前・説明・注意と「押せる場所」の一覧（ボタン） |
| `ScreenFlow` | P-1。通った画面の列、Stage、ScreenPane、戻る・最初から・ヒント。状態は runtime の `createFlow` が持ちます。行き先が手順のときは `onleave` で外に知らせます |
| `TopicView` | Topic の `kind` で表示を切り替えます。いまは `screenFlow` だけで、ほかは「まだ表示できません」と出します（手順 4 で足します） |
| `Frame` | P-0 の外枠。題名・版・適用範囲のプルダウン・用語集のヘッダー、目次、選んだ Topic の中身。`chrome="none"` で中身だけを出します。色のトークン `--em-*` の既定（明暗）はここで定義し、外から同じ名前で上書きできます |

文言は `text.ts` に日本語と英語を同じキーで持ちます（`lang` で切り替え）。

### Web Components（`src/element/`）

`npm run build` で `dist/element/experiential-manual.js`（ES module、1 ファイル）を出します。読み込むと `<experiential-manual>` が登録されます。スタイルは Shadow DOM の中に閉じています。

```html
<script type="module" src="experiential-manual.js"></script>
<experiential-manual src="./help/manual.json" topic="topic-buy" hints></experiential-manual>
```

| 属性 | 内容 |
|---|---|
| `src` | Manual の JSON の URL。画像の相対パスはこの URL が基準です |
| `topic` | 最初に開く Topic の id。省くと先頭 |
| `screen` | 最初に開く画面の id |
| `scope` | 適用範囲の初期値。`model=MV-50;site=outdoor` の形 |
| `hints` | ホットスポットの枠を最初から出します |
| `chrome="none"` | 外枠（ヘッダー・目次）を出さず、Topic の中身だけを出します |
| `lang` | `ja`（既定）か `en` |

JavaScript からは `element.manual = manualObject` のように Manual を直接渡せます（`src` より優先）。

`demo/index.html` が券売機の例を 3 通りの属性で置いたページです。`npm run build -w packages/player` の後、`packages/player` を静的に配信して `/demo/` を開きます（例: `npx serve packages/player`）。

## まだ無いもの

P-2（手順）・P-3（説明）・P-4（困ったとき）の表示と、P-0 の検索です。順序は [docs/design/player-and-editor.md](../../docs/design/player-and-editor.md) の 6 節にあります。

## コマンド

リポジトリのルートから実行します（npm workspaces）。

| コマンド | 内容 |
|---|---|
| `npm run check:player` | svelte-check（runtime・部品・Web Components の型検査） |
| `npm run test:player` | Vitest。券売機の例（`test/fixtures/kenbaiki.manual.json`）で runtime を確かめます |
| `npm run build -w packages/player` | `tsc` で runtime を `dist/` に、`vite build` で Web Components を `dist/element/` に出力します |
