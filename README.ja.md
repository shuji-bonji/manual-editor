# manual-editor（仮称）

> [!NOTE]
> 「manual-editor」は仮称です。製品名は決まっていません。

体験型の操作マニュアルを、画面の上で作る Web アプリの試作です。体験型のマニュアルは、スクリーンショットの上に押せる場所（ホットスポット）を置き、押すと次の画面に進む形の説明です。2021 年の作品 `experience_based_operation_explanation` を、編集画面付きで作り直しています。

[`@shuji-bonji/experiential-manual-model`](https://www.npmjs.com/package/@shuji-bonji/experiential-manual-model) の JSON を読み書きし、その型と `validateManual` をそのまま使います。

[English](./README.md)

## 起動方法

```sh
npm install && npm run dev
```

その他のコマンドです。

| コマンド | 内容 |
|---|---|
| `npm run check` | svelte-check による型の検査 |
| `npm test` | Vitest による単体テスト |
| `npm run build` | `build/` に静的ファイルを出力します（adapter-static、SPA、PWA） |
| `npm run preview` | `build/` を手元で配信します |

GitHub Pages 用にビルドするときは、リポジトリ名を環境変数で与えます。`BASE_PATH=/manual-editor npm run build` です。

## できること

- **開く・保存する**: manual-model の JSON を開いて保存します（File System Access API が使えるブラウザーではそれを使い、使えなければファイル選択とダウンロードで行います）。2021 年の JSON は `fromLegacyJson` で変換して開き、警告を表示します。
- **Topic**: 追加、題名の編集、並べ替え、削除、種類（`description` / `procedure` / `screenFlow` / `troubleshooting`）の選択ができます。
- **画面の編集**（`screenFlow`）: 左に構成ツリー、中央に閲覧部品（player）のステージ、右にインスペクターの 3 列です。スクリーンショットを追加し、画像の上でドラッグして矩形・円・多角形のホットスポットを描きます。選んだホットスポットは中をドラッグで移動、ハンドルで変形、矢印キーで 1 px（Shift で 10 px）動かせます。ラベル、操作の種類（押す・入力・読む）、遷移先（画面か手順。「新しい画面を追加して遷移先にする」もできます）、条件を付けます。画像を差し替えて大きさが変わったときは、座標を同じ縮尺で変換するかを尋ねます。座標は元の画像の画素で持ちます。
- **手順・注意・適用範囲**（`procedure`）: 入れ子の手順、期待される結果、警告・注意・備考、適用範囲（`Scope`）と `scopeRefs` の付け外しができます。
- **検査**: `validateManual` の errors と warnings を一覧にします。項目を押すと、該当の Topic・画面・手順へ移ります。
- **編集 ｜ 体験**: 同じステージで切り替えます。体験は閲覧部品（`packages/player`）そのもので、ホットスポットを押すと遷移先へ進み、戻る・最初からもできます。体験中に進んだ画面は、編集に戻したときに選ばれています。手順・説明・困ったときの Topic も体験で表示できます。
- **元に戻す・やり直し**と、`localStorage` への下書きの自動保存です。

## できないこと

> [!IMPORTANT]
> このアプリは S1000D への出力をしません。保存した JSON を、Skill `experience-to-s1000d` か writer-mcp の `convert_manual` に渡してください。

- `description` の本文 Block の編集（読み込んだ Block はそのまま保存します）。
- `troubleshooting` の手順の `answers` の編集。
- 遷移の地図（下の引き出しに場所だけあります）、構成ツリーのドラッグでの並べ替え（↑↓ で動かします）、画像の一部を塗りつぶすマスク。
- AI の支援、ログイン、共有、サーバー側の保存。

## 画像の持ち方

既定では、JSON に画像のデータは入りません。`Asset.source.path` にはファイル名だけが入り、画像のファイルは別に持ちます。JSON を開いたあとは、「適用範囲・素材」タブで画像のファイルを割り当てます（「画像をまとめて割り当てる」はファイル名で照合します）。「画像を JSON に埋め込む」を選ぶと、各画像を data URL にして `source.path` に入れます。JSON は大きくなります。

## データは手元のブラウザーの中だけで扱います

> [!NOTE]
> このアプリにサーバーはありません。ファイルの読み書きはブラウザーの中だけで行い、外部に送信しません。ブラウザーに残るのは `localStorage` の下書き（画像を含みません）だけで、画面上のバナーから破棄できます。

## 技術

SvelteKit 2 と Svelte 5（runes）、TypeScript、`@sveltejs/adapter-static`、`@vite-pwa/sveltekit` を使います。CSS は素の CSS で、ライトとダークのトークンを `src/app.css` に置いています。画面の文言は `src/lib/i18n.ts` にまとめています。

| 場所 | 役割 |
|---|---|
| `src/lib/ops.ts` | 編集の純粋な関数（`addTopic`、`addHotspot`、`setTransition` など） |
| `src/lib/io.ts` | JSON の読み込み・書き出し、下書き、ファイルの入出力 |
| `src/lib/issues.ts` | `validateManual` の場所を画面上の場所に直します |
| `src/lib/state.svelte.ts` | `Manual` を 1 つ持つ store |
| `src/lib/components/` | 画面のパネル |

## リポジトリの構成

| 場所 | 内容 |
|---|---|
| ルート（`src/`） | 作成ツール（SvelteKit）。`packages/player` の `Stage` の上に作図の層を重ね、体験は `ScreenFlow` をそのまま置いています（設計書 3 節の E-0・E-1） |
| `packages/player` | 閲覧部品（仮称 experiential-manual-player）。runtime（Svelte 非依存。遷移・履歴・適用範囲・手順の番号・問答）、部品（Stage・P-1・P-0。Svelte 5）、Web Components `<experiential-manual>` のビルドと `demo/`。P-2〜P-4 はまだです。`npm run test:player` / `npm run check:player` で確かめます。詳しくは [packages/player/README.ja.md](./packages/player/README.ja.md) |

npm workspaces です。`npm install` はルートで 1 回だけ行います。

## ライセンス

MIT

## 設計文書

このリポジトリは、体験型マニュアルの製品プロジェクト（player・editor・cli）の中心です。基盤（s1000d-core・MCP サーバー・Skill・experiential-manual-model）は [s1000d-stack](https://github.com/shuji-bonji/s1000d-stack) にあり、2026-11-07 にこの製品を別プロジェクトとして分けました（s1000d-stack の D-29）。

| 文書 | 内容 |
|---|---|
| [docs/notes/editor-and-viewer-study.md](./docs/notes/editor-and-viewer-study.md) | 作るべきツールの検討（利用者、候補のツール、構成、題材の選定、決めること） |
| [docs/design/player-and-editor.md](./docs/design/player-and-editor.md) | player を先に作り、editor をその上の編集モードとして重ねる画面設計の草案 |
