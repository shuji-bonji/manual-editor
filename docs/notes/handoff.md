# 引き継ぎメモ（2026-11-08 JST）

新しいチャットで体験型マニュアルの製品（player・editor・cli）の作業を続けるための入口です。設計の本文は `docs/` の 2 文書にあり、このメモはそこへの案内と、決まっていることの要約です。

> [!IMPORTANT]
> 1. 基盤（s1000d-core・MCP サーバー・Skill・experiential-manual-model）は [s1000d-stack](https://github.com/shuji-bonji/s1000d-stack) にあり、このプロジェクトはそれを使う側です。基盤の決定事項（[DECISIONS.md](https://github.com/shuji-bonji/s1000d-stack/blob/main/docs/DECISIONS.md) の D-01・D-09・D-28・D-29）は覆しません。製品側で基盤に足りないものが分かったら、直さずに s1000d-stack へ要望として戻します。
> 2. 製品には S1000D の名前を付けません（D-01）。S1000D への変換は CLI の `to-s1000d`（writer の処理を Node で呼ぶ）に置き、editor には同梱しません。
> 3. AI が無くても動く形を先に作ります（D-09）。WebMCP などの AI 支援は後です。

## 読む順番

1. [docs/notes/editor-and-viewer-study.md](./editor-and-viewer-study.md) — 作るべきツールの検討。利用者の 4 区分、候補のツール 8 つ、構成案（player / editor / cli）、題材の選定（8 節・8-2 節）、決めること（10 節）
2. [docs/design/player-and-editor.md](../design/player-and-editor.md) — 画面設計の草案。**player を先に作り、editor をその上の編集モードとして重ねる**。player の画面 P-0〜P-4、editor の画面 E-0〜E-7、状態の持ち方、作る順序（6 節）、試作から残すもの・捨てるもの（7 節）
3. [README.ja.md](../../README.ja.md) — 試作 0.1.0 でできること・できないこと

## いまの状態

| 項目 | 状態 |
|---|---|
| リポジトリ | `shuji-bonji/manual-editor`（Private）。ローカルは `/Users/bonji/workspace/shuji-bonji/webapps/manual-editor`。初回コミット `23c1e88`、CI（Vitest 32 件）緑 |
| 試作 0.1.0 | SvelteKit 2 ＋ Svelte 5 ＋ `adapter-static` ＋ PWA。Topic 一覧、画面エディター（矩形・円）、手順・注意・適用範囲、検査、体験表示、Undo/Redo、下書き。見送り: 説明 Block の編集、故障探求の行き先、多角形、ホットスポットの移動・変形、英語の文言、Playwright |
| 依存 | `@shuji-bonji/experiential-manual-model` `^0.1.0` だけ |
| 名前 | 製品名は未定（s1000d-stack の U-05）。`manual-editor` は仮称。**player と cli を npm に出す前に決める**（npm の名前は後から変えられない。GitHub のリポジトリ名は転送されるので変えてよい） |

## 次にやること（design/player-and-editor.md 6 節の順）

| 順 | 作業 | 前提 |
|---|---|---|
| 1 | experiential-manual-model 0.2.0（`AssetFile.width` / `height`、`data` の分離、`Screen.capture` / `Hotspot.capture`、`Admonition.title`） | **基盤側の作業**。s1000d-stack のプロジェクトで行い、公開されたら依存を `^0.2.0` に上げる |
| 2 | player の `runtime`（Svelte 非依存の TypeScript。遷移・履歴・適用範囲の絞り込み・手順の番号） | 置き場所は別リポジトリ `experiential-manual-player`（仮称）か、このリポジトリの `packages/` か。まだ決めていない |
| 3 | player の部品（Stage、P-1 の右欄、P-0 の外枠）と Web Components のビルド | 券売機の例を学習サイトのページに置いて動くこと |
| 4 | player の P-2 / P-3 / P-4 | |
| 5 | editor の枠（E-0）と E-1。`src/lib/ops.ts` / `io.ts` / `i18n.ts` を残し、`components/` を組み直す | 7 節の表 |
| 6〜8 | 素材・検査・遷移の地図、E-2〜E-4、Playwright 1 本 | |

題材は、画面だけの実例に **e-shiwake のヘルプ**、機器の実例に **Raspberry Pi（自分で撮る。MIT で同梱）**、取り込みの実例に **iFixit（`import-ifixit`、CC BY-NC-SA、同梱しない）** を予定しています（editor-and-viewer-study.md 8-2 節）。

## 動かし方

```sh
npm install
npm run dev        # 開発サーバー
npm run check      # svelte-check
npm test           # Vitest
npm run build      # build/（adapter-static、PWA）
```

> [!NOTE]
> チャットから接続した Linux VM では Mac の `node_modules` を使えません（OS ごとに native binding が違う）。VM で動かすときは別の場所に rsync して `npm ci` します。`deploy.yml` は手動実行だけで、リポジトリが Private の間は GitHub Pages に配備できません。
