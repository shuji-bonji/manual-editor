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
| `npm run test:e2e` | ビルドしてから Playwright（Chromium）で主な流れを通します（`e2e/editor.spec.ts`。開く → 描く → つなぐ → 体験 → 保存、2021 年の JSON の地図・検査・素材、手順・困ったとき・説明の書き足し）。初回は `npx playwright install chromium` が要ります |
| `npm run build` | `build/` に静的ファイルを出力します（adapter-static、SPA、PWA） |
| `npm run make:help` | ビルドしてから、上の帯の「ヘルプ」で開く体験型マニュアル（`static/help/help.manual.json` と画面の画像）を editor 自身の画面から生成し直します（`scripts/make-help.mjs`、Playwright）。UI を変えたら実行します |
| `npm run preview` | `build/` を手元で配信します |

GitHub Pages 用にビルドするときは、リポジトリ名を環境変数で与えます。`BASE_PATH=/manual-editor npm run build` です。

## できること

- **開く・保存する**（上の帯の「ファイル」のメニュー）: 1 冊のマニュアルを、1 つのファイル（`<題名>.emanual`）に保存します。画像も一緒に入り、そのファイルを開くと画像ごと元に戻ります。File System Access API が使えるブラウザーでは、開いたファイルや前に保存したファイルに上書きします（保存先はローカルのディスクでも、同期フォルダーでも構いません）。使えないブラウザーでは、ファイル選択とダウンロードで行います。「開く」は、zip であることと、中が `manual.json` と `assets/` だけであることを確かめ、違えば理由を出して開きません。
- **展開したフォルダーから取り込む**: マニュアルのファイルを展開して手で直したフォルダーや、スクリプトが書き出したフォルダーを読み込みます（読むだけで、フォルダーには書き戻しません）。画像が `assets/` の外にあれば `assets/` に揃え、マニュアルが指していないファイルは持ち込みません。2021 年の JSON のフォルダーも、ここから `fromLegacyJson` で変換して取り込みます。
- **Topic**: 追加、題名の編集、並べ替え、削除、種類（`description` / `procedure` / `screenFlow` / `troubleshooting`）の選択ができます。
- **画面の編集**（`screenFlow`）: 左に構成ツリー、中央に閲覧部品（player）のステージ、右にインスペクターの 3 列です。スクリーンショットを追加し、画像の上でドラッグして矩形・円・多角形のホットスポットを描きます。選んだホットスポットは中をドラッグで移動、ハンドルで変形、矢印キーで 1 px（Shift で 10 px）動かせます。ラベル、操作の種類（押す・入力・読む）、遷移先（画面か手順。「新しい画面を追加して遷移先にする」もできます）、条件を付けます。画像を差し替えて大きさが変わったときは、座標を同じ縮尺で変換するかを尋ねます。座標は元の画像の画素で持ちます。
- **手順の編集**（`procedure`）: 閲覧部品の手順の一覧と同じ並びで、文がそのまま入力欄になっています。Enter で次の手順、Tab / Shift+Tab で段の上げ下げ、空の手順で Backspace すると削除、Alt+↑↓ で並べ替えです。期待される結果と警告・注意・備考は手順の行の中で書き、図は下の「素材」のカードを手順にドラッグして付けます。操作対象（ホットスポット）、分岐（条件と行き先）、適用範囲は右のインスペクターで指定します。
- **説明の編集**（`description`）: 見出し・段落・箇条書き・表・図・注意の 6 種のブロックを足し、その場で書きます。見出しの中にもブロックを置けます。図は素材のプルダウンか、素材のカード・画像ファイルのドロップで指定します。
- **困ったときの編集**（`troubleshooting`）: 問いと答えを手順の行の中で書き、答えごとに行き先（この Topic の手順、画面、他の Topic の手順）を選びます。問いの無い手順は「対処」です。
- **ヘルプ**（上の帯）: editor 自身の使い方を、体験型マニュアルとして開きます。画面の見かた（画面の流れ）・画面の流れを作る（手順）・保存されるもの（説明）・困ったとき（問答）の 4 つの Topic があり、画面の画像と押せる場所の座標は `scripts/make-help.mjs` が editor の画面から生成しています。「このヘルプを例として開く」で、このヘルプの JSON を editor に読み込んで中身を見られます。同梱の小さな例（券売機。画像は仮のもの）もここから開きます。上の帯には、いま開いている 1 冊に対する操作だけを置いています。体験型マニュアルの実例の 1 冊目です。
- **素材**（下の引き出し）: `Manual.assets` をサムネイルで一覧にし、使っている画面・手順の数と、使われていないもの・画像の無いものを出します。追加はファイルの選択、フォルダーの一括追加、引き出しやステージへのドロップ、スクリーンショットの貼り付け（Ctrl/⌘+V。画面の流れの Topic を選んでいれば新しい画面になります）のどれでもできます。画像の幅・高さは追加時に読んで `AssetFile.width` / `height` に書きます。素材を選ぶとインスペクターで代替テキスト・出典・使っている場所・差し替え・マスク（矩形で囲んだ場所を塗りつぶし、元の画像は残しません）・削除ができます。
- **遷移の地図**（下の引き出し）: Topic の画面をノード、`Hotspot.transition` を辺にした図です。配置は開始画面からの幅優先探索による自前の階層配置で、到達できない画面と遷移先の無い遷移を赤く出します。多くの画面から同じ画面へ戻る遷移（「とりけし → STEP1」）は線にせず名札にします。ノードを押すとその画面を選びます。
- **検査**（下の引き出し）: `validateManual` の errors と warnings を Topic ごとに一覧にし、場所を「画面 › ホットスポット」の名前で、文はよく出るものを日本語で出します。項目を押すと該当の Topic・画面・手順・素材へ移り、到達できない画面は「地図で見る」で地図に出せます。保存のたびにエラーがあれば通知します（保存は止めません）。
- **編集 ｜ 体験**: 同じステージで切り替えます。体験は閲覧部品（`packages/player`）そのもので、ホットスポットを押すと遷移先へ進み、戻る・最初からもできます。体験中に進んだ画面は、編集に戻したときに選ばれています。手順・説明・困ったときの Topic も体験で表示できます。
- **元に戻す・やり直し**ができます。
- **前回の続きから始まります**: 編集中の 1 冊は、ブラウザーの中の作業場所（Origin Private File System）に `manual.json` と `assets/` の形で置きます。`manual.json` は編集のたびに、画像は取り込んだ時点で書くので、タブを閉じても次に開いたときに続きから始まります。貼り付けた画像とマスクした画像も残ります。

## できないこと

> [!IMPORTANT]
> このアプリは S1000D への出力をしません。保存したファイル（`.emanual`）の拡張子を `.zip` に変えて展開し、中の `manual.json` を、Skill `experience-to-s1000d` か writer-mcp の `convert_manual` に渡してください。

- Markdown の貼り付けからブロックへの分解、表のセルの結合、ブロックの 2 段以上の入れ子（見出しの中の見出し）。
- 構成ツリーのドラッグでの並べ替え（↑↓ で動かします）、遷移の地図の位置の保存（配置は毎回自動です）。
- 配布用のエクスポート（閲覧部品を同梱したもの）の書き出し。次の版で作ります。
- manual の JSON 単体を「開く」こと。JSON の入ったフォルダーを「展開したフォルダーから取り込む」で読みます。
- ZIP64（4 GB 以上）と、暗号化された zip の読み込み。
- AI の支援、ログイン、共有、サーバー側の保存。

## 画像の持ち方

マニュアルのファイル（`.emanual`）の中身は、`manual.json` と画像のフォルダー `assets/` を 1 つにまとめた zip です。拡張子を `.zip` に変えると展開できます。取り込んだ画像は、ブラウザーの中の作業場所の `assets/` にコピーし、`Asset.source.path` には `manual.json` からの相対パス（`assets/01-start.png`）が入ります。保存するファイルには、マニュアルが使っている画像だけが入ります（素材の一覧から外した画像は入りません）。画像が見つからない素材には、下の「素材」の引き出しで画像のファイルを割り当てます（「画像をまとめて割り当てる」はファイル名で照合します）。マニュアルの題名・版と適用範囲（`Scope`）は、構成ツリーの先頭の「マニュアル」を選ぶとインスペクターで編集できます。

## データは手元のブラウザーの中だけで扱います

> [!NOTE]
> このアプリにサーバーはありません。ファイルの読み書きはブラウザーの中だけで行い、外部に送信しません。ブラウザーに残るのは、作業場所にある編集中の 1 冊（`manual.json` と画像）と、`localStorage` の「どの 1 冊を開いていたか」の記録です。「新規」や「開く」で別の 1 冊に切り替えると、前の 1 冊は作業場所から消えます。作業場所を使えないブラウザーでは、その旨を画面に出し、タブを閉じる前に確認します。

## 技術

SvelteKit 2 と Svelte 5（runes）、TypeScript、`@sveltejs/adapter-static`、`@vite-pwa/sveltekit` を使います。CSS は素の CSS で、ライトとダークのトークンを `src/app.css` に置いています。画面の文言は `src/lib/i18n.ts` にまとめています。

| 場所 | 役割 |
|---|---|
| `src/lib/ops.ts` | 編集の純粋な関数（`addTopic`、`addHotspot`、`setTransition` など） |
| `src/lib/io.ts` | JSON の読み込み・書き出し、利用者のファイルの入出力 |
| `src/lib/zip.ts` | zip の読み書き（書くときは無圧縮、読むときは無圧縮と deflate） |
| `src/lib/bundle.ts` | マニュアルのファイルの構成の検査、フォルダーからの取り込み、画像の path を `assets/` に揃える処理、zip に詰める処理 |
| `src/lib/workspace.ts` | ブラウザーの中の作業場所（編集中の 1 冊の `manual.json` と画像）の読み書き |
| `src/lib/issues.ts` | `validateManual` の場所を画面上の場所に直します |
| `src/lib/state.svelte.ts` | `Manual` を 1 つ持つ store |
| `src/lib/components/` | 画面のパネル |

## リポジトリの構成

| 場所 | 内容 |
|---|---|
| ルート（`src/`） | 作成ツール（SvelteKit）。`packages/player` の `Stage` の上に作図の層を重ね、体験は `ScreenFlow` をそのまま置いています（設計書 3 節の E-0・E-1） |
| `packages/player` | 閲覧部品（仮称 experiential-manual-player）。runtime（Svelte 非依存。遷移・履歴・適用範囲・手順の番号・問答）、部品（Stage・P-1・P-0。Svelte 5）、Web Components `<experiential-manual>` のビルドと `demo/`。P-2〜P-4 も入っています。`npm run test:player` / `npm run check:player` で確かめます。詳しくは [packages/player/README.ja.md](./packages/player/README.ja.md) |

npm workspaces です。`npm install` はルートで 1 回だけ行います。

## ライセンス

MIT

## 設計文書

このリポジトリは、体験型マニュアルの製品プロジェクト（player・editor・cli）の中心です。基盤（s1000d-core・MCP サーバー・Skill・experiential-manual-model）は [s1000d-stack](https://github.com/shuji-bonji/s1000d-stack) にあり、2026-11-07 にこの製品を別プロジェクトとして分けました（s1000d-stack の D-29）。

| 文書 | 内容 |
|---|---|
| [docs/notes/editor-and-viewer-study.md](./docs/notes/editor-and-viewer-study.md) | 作るべきツールの検討（利用者、候補のツール、構成、題材の選定、決めること） |
| [docs/design/player-and-editor.md](./docs/design/player-and-editor.md) | player を先に作り、editor をその上の編集モードとして重ねる画面設計の草案 |
