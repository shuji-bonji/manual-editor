# 引き継ぎメモ（2026-11-15 00:10 JST 更新）

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
| player の runtime | **済み（2026-11-08）**。`packages/player/src/runtime/`（scope・lookup・flow・procedure・troubleshooting・store）。Svelte 非依存。Vitest 22 件（券売機の例で STEP1 → STEP2 → 戻る、適用範囲、手順の番号、問答）。model 0.1.0 と 0.2.0（ローカル）の両方の型で `tsc` が通る。README は [packages/player/README.ja.md](../../packages/player/README.ja.md) |
| player の部品と Web Components | **済み（2026-11-08）**。`packages/player/src/components/`（Stage・ScreenPane・ScreenFlow・TopicView・Frame、Svelte 5）、`src/element/ExperientialManual.svelte`（`<experiential-manual>`、Shadow DOM、属性 src / topic / screen / scope / hints / chrome / lang）。`npm run build -w packages/player` で `dist/element/experiential-manual.js`（141 KB、gzip 40 KB）。`demo/index.html` で券売機の例を 3 通りに置き、クラウド側の Playwright で押す・Tab＋Enter・戻る・狭い幅（420 px）を確認した。svelte-check 0 件。TopicView は kind で切り替える |
| player の P-2 / P-3 / P-4 | **済み（2026-11-08）**。`ProcedureView`（一覧と「1 つずつ」、分岐の選択、別 Topic への行き先は `onleave`）、`BlockView`（section の再帰、表・図・注意）、`FaultTree`（問答の履歴と対処）、`Figure`（画像は押して拡大、Screen を指すと Stage で開く、3D などは種類と名前だけ）、`Admonitions`（共通）。券売機の例の 3 Topic を demo に足し、Playwright で一覧 → 1 つずつ → 分岐（2 → 3）→ 終端、問答「ない」→ 対処「用紙を補充する」→ 戻る、を確認。svelte-check 0 件。`dist/element` は 181 KB（gzip 47 KB） |
| player の dist | ルートの `check` と `build` は `@shuji-bonji/experiential-manual-player/runtime` の型を `packages/player/dist/` から読む。`npm install` 時の `prepare`（player）と、ルートの `npm run check` の先頭で `tsc -p tsconfig.build.json` を実行して作る。手元で型エラー「Cannot find module …/runtime」が出たら `npm run build:runtime -w packages/player` |
| リポジトリの形 | npm workspaces（`workspaces: ["packages/*"]`）。editor はルートのまま（`apps/editor` への移動は手順 5 で組み直すときに行う）。`npm run test:player` / `npm run check:player` を CI に足した |
| editor の E-5 / E-6 / E-7 | **済み（2026-11-08、手順 6）**。下の引き出しは「素材 / 遷移の地図 / 検査」の 3 つ。`FlowMap`（`src/lib/flowmap.ts` の自前の階層配置。到達不可・参照切れを赤、多くの画面から戻る遷移は名札）、`AssetsPanel`（サムネイル、使用数、追加・フォルダー・ドロップ・貼り付け、幅・高さを `AssetFile` に書く）、`AssetInspector` ＋ `MaskDialog`（塗りつぶし、U-16）、`IssuesPanel`（Topic ごと、場所は名前、文は日本語、「地図で見る」）。マニュアルの題名・版・適用範囲は構成ツリー先頭の「マニュアル」→ `ManualPanel`。`LibraryPanel` は削除。3 列と引き出しを 1 画面に収めた。svelte-check 0 件、Vitest 52 件、build 通過。確かめ方（2021 年の JSON の 23 画面の Topic で地図が読める、画面を消すと到達不可 12・参照切れ 2 が赤く出る、検査→地図、ドロップ・貼り付け・マスク、保存した JSON に `width` / `height` / `hash`）はクラウド側の Playwright で通過。設計との差は design/player-and-editor.md 9 節 |
| editor の E-2 / E-3 / E-4 | **済み（2026-11-08、手順 7）**。`ProcedureEditor` をアウトライナーに作り直し（Enter / Tab / Shift+Tab / Backspace / Alt+↑↓、結果・注意・図を行の中に、図は素材のカードのドロップ）、`StepInspector`（操作対象・図・分岐・適用範囲・削除）、`TargetSelect`（行き先のプルダウン）、`DescriptionEditor`（6 種の Block、section の 1 段の入れ子、表のセル編集、figure のドロップ、Block ごとの適用範囲）、troubleshooting は `ProcedureEditor` の問い・答えの欄。ops に `insertStepAfter`・分岐・答え・図・Block の関数（テスト 6 件）。svelte-check 0 件、Vitest 58 件、build 通過。確かめ方（券売機の例で手順・説明・困ったときを 1 つずつ作り、体験で問答が出て、保存した JSON に `next` / `answers` / `blocks` が入る）はクラウド側の Playwright で通過。設計との差は design/player-and-editor.md 10 節 |
| E2E（Playwright） | **済み（2026-11-08、手順 8）**。`e2e/editor.spec.ts` の 3 本（主な流れ、2021 年の JSON、券売機の例の書き足し）。`npm run test:e2e`。CI にも載せた（`npx playwright install --with-deps chromium` → `npx playwright test`）。クラウド側で 3 回とも 3 本通過（約 6 秒）。設計書 6 節の手順 1〜8 はこれで全部済み。設計との差は design/player-and-editor.md 11 節 |
| ヘルプ（実例の 1 冊目） | **済み（2026-11-14）**。editor の使い方を editor 自身で作った体験型マニュアル。`scripts/make-help.mjs`（`npm run make:help`）が Playwright で画面を撮り、`data-testid` の位置をホットスポットにして `static/help/` に書く。上の帯の「ヘルプ」で player の外枠の中に開く。「このヘルプを例として開く」で editor に読み込める。**上の帯の「券売機の例を開く」は外し、ヘルプの「例:」に移した**（2026-11-14。上の帯は開いている 1 冊の操作だけ）。ダッシュボード（新規・作ったマニュアルの一覧・設定・ヘルプ）は一通りできてから足す。Vitest 61 件・E2E 4 本。詳細は design/player-and-editor.md 12 節。**UI を変えたら `npm run make:help` で作り直す**（画面と座標が古くなる。作り直しの忘れは `help.test.ts` では検出できない） |
| 試作 0.1.0 | SvelteKit 2 ＋ Svelte 5 ＋ `adapter-static` ＋ PWA。Topic 一覧、画面エディター（矩形・円）、手順・注意・適用範囲、検査、体験表示、Undo/Redo、下書き。見送り: 説明 Block の編集、故障探求の行き先、多角形、ホットスポットの移動・変形、英語の文言、Playwright |
| 依存 | `@shuji-bonji/experiential-manual-model` `^0.2.0`（ルートと `packages/player` の両方。2026-11-08 に上げた）。0.2.0 で `AssetFile.path` が任意になり data URL は `source.data` に入るので、試作側は `io.ts` の `embeddedData(file)` / `fileName(file)` で読む（0.1.0 の JSON の `path` に入った data URL も読める） |
| 名前 | **決定（2026-11-14）**: 製品の共通の語は **Experiential Manual**。作成ツールは Experiential Manual Editor、閲覧部品は Experiential Manual Player、CLI は Experiential Manual CLI（s1000d-stack の DECISIONS.md D-30）。model・player の npm 名と `<experiential-manual>` はそのまま使える。**まだ直していないもの**: README（日英）と `packages/player/README`（日英）の「仮称」、`package.json` の `description`、画面の題名と PWA の manifest の名前、設計書の「仮称」。GitHub のリポジトリ名 `manual-editor` を変えるかは未決（変えても転送される） |

## 次にやること（design/player-and-editor.md 6 節の順）

| 順 | 作業 | 前提 |
|---|---|---|
| 1 | experiential-manual-model 0.2.0 | **済み**。npm に 0.2.0 が公開され（2026-11-08）、このリポジトリの依存も `^0.2.0` に上げた |
| 2 | player の `runtime` | **済み**（`fc437f8`）。置き場所は `packages/player`（設計書 8 節に決定を書いた） |
| 3 | player の部品（Stage、P-1 の右欄、P-0 の外枠）と Web Components のビルド | **済み**（`packages/player`。上の「いまの状態」）。残り: 学習サイト（s1000d-stack の `site/`）のページに `dist/element/experiential-manual.js` と券売機の例を置くこと。player が npm 未公開のため、置き方（ビルド成果物を site にコピーするか、公開後に CDN から読むか）は製品名の決定（U-05）と合わせて決める |
| 4 | player の P-2 / P-3 / P-4 | **済み**。残り（後の版）: P-0 の検索、P-1 の `input` の入力欄の見本、3D・動画の表示。自作の例（e-shiwake のヘルプ、Raspberry Pi）は素材が揃ってから demo に足す |
| 5 | editor の枠（E-0）と E-1 | **済み（2026-11-08）**。`TopBar`（ファイル・Undo/Redo・題名・編集｜体験・問題の件数）、`StructureTree`（Topic › 画面/手順、● ⚠ ◀、↑↓）、`EditStage`（player の `Stage` を `mode="edit"` で置き、`overlay` に作図・選択枠・ハンドル。矩形・円・多角形、移動・変形・矢印キー・Delete、手のひらと拡大縮小、画面の説明と注意の欄）、`Inspector`（Topic / 画面 / ホットスポット。遷移先に「新しい画面を追加して遷移先にする」、画像の差し替えで縮尺の変換を確認）、`Drawer`（素材・適用範囲 / 遷移の地図（場所だけ）/ 検査）。体験は player の `ScreenFlow` / `TopicView` をそのまま置き、進んだ画面を selection に追いかける。`ops.ts` に `moveHotspot` / `scaleHotspots`、`state.svelte.ts` に `mode` / `drawer` / `tool` / `focusLabel` / `replaceScreenImage` / `addBlankScreen`。`Player` / `HotspotCanvas` / `ScreenEditor` / `TopicList` / `FileBar` は削除。`ProcedureEditor` / `DescriptionEditor` / `LibraryPanel` / `IssuesPanel` / `ScopeRefs` は残して引き出しと中央に置いた。確かめ方（2021 年の JSON を開いて描き・動かし・つなぎ・体験で進める）はクラウド側の Playwright で通過。svelte-check 0 件、Vitest 33 件、build 通過。ルートの app は動かしていない（`apps/editor` への移動は見送り。いまの形で困っていない） |
| 6 | E-6 素材、E-7 検査、E-5 遷移の地図 | **済み（2026-11-08）**。上の「いまの状態」と design/player-and-editor.md 9 節。残り（後の版）: 地図のノードの位置の保存はしない（設計どおり）。マスクは矩形だけ（多角形・ぼかしは要望が出てから） |
| 7 | E-2 / E-3 / E-4 | **済み（2026-11-08）**。上の「いまの状態」と design/player-and-editor.md 10 節。見送り: Markdown の貼り付けからの分解、図に `Screen` を指すこと（model の `assetRefs` は素材 id だけ。要るなら s1000d-stack へ要望）、構成ツリーのドラッグ |
| 8 | Playwright 1 本 | **済み（2026-11-08）**。`e2e/editor.spec.ts`（3 本）と `playwright.config.ts`。Mac では最初に `npm install` と `npx playwright install chromium` を 1 回行う |

設計書 6 節の 8 つの手順はすべて済みました。次の候補（優先順は利用者が決める）:

> [!IMPORTANT]
> **2026-11-14 に、データの扱いを取り決めました（未実装）**。編集は常にブラウザーの中の workspace（OPFS）で行い、保存は 1 冊を 1 つの zip（`manual.json` ＋ `assets/`）にして書き出します。配布は閲覧パッケージ（先に単一の HTML、後にフォルダー）で、受け取った側は体験モードで開き、編集するときは複製します。取り決めの全文と作る順序は [design/player-and-editor.md](../design/player-and-editor.md) 13 節です。下の候補より先に、13.7 節の順で進める想定です。
> **13.7 の 1〜3 は済み**（1: workspace と画像の取り込み、2026-11-14。2・3: zip の読み書き・「ファイル」のメニュー・ヘルプの `assets/`、2026-11-15。記録は 13.8・13.9 節。svelte-check 0 件、Vitest 83 件、E2E 7 本）。次は 13.7 の 4（player の IIFE のビルドと、単一の HTML の閲覧パッケージ化）。Mac の Chrome で、上書き保存（開いた zip にそのまま保存できること）を一度手で確かめる。

1. **公開の準備**: 製品名は Experiential Manual Editor に決まった（2026-11-14、D-30）。README・画面・manifest の「仮称」を製品名に直し、`packages/player` の npm 公開（`private: true` を外す）、GitHub Pages への配備（`deploy.yml`。リポジトリを Public にするか）
2. **学習サイトへの埋め込み**: s1000d-stack の `site/` に `dist/element/experiential-manual.js` と券売機の例を置く（手順 3 の残り。置き方は公開の形と合わせて決める）
3. **後の版に回したもの**: Markdown の貼り付けから Block への分解（E-3）、構成ツリーのドラッグでの並べ替え、P-0 の検索、P-1 の `input` の入力欄の見本、英語の文言（`i18n.ts` に `en` を足す）、マスクの多角形
4. **基盤への要望**: 手順の図（`Step.assetRefs`）で `Screen` を指せるようにすること（E-2 の「図が Screen を指すときは、その画面を P-1 のステージで開く」のため）
5. **題材**: editor 自身のヘルプを実例の 1 冊目にした（2026-11-14）。券売機の例は「テスト用の小さな例」として残す。下の 3 つは機器・取り込みの実例として引き続き候補
6. **ヘルプを S1000D にする実演**: `static/help/help.manual.json` を `experience-to-s1000d` に渡し、説明 DM・手順 DM・故障探求 DM が出ることを学習サイトの実例にする

題材は、画面だけの実例に **e-shiwake のヘルプ**、機器の実例に **Raspberry Pi（自分で撮る。MIT で同梱）**、取り込みの実例に **iFixit（`import-ifixit`、CC BY-NC-SA、同梱しない）** を予定しています（editor-and-viewer-study.md 8-2 節）。

## 動かし方

```sh
npm install
npm run dev        # 開発サーバー
npm run check      # svelte-check
npm test           # Vitest
npm run build      # build/（adapter-static、PWA）
npx playwright install chromium   # 初回だけ
npm run test:e2e   # ビルドして Playwright（e2e/editor.spec.ts の 7 本）
npm run make:help  # ビルドして、ヘルプ（static/help/）を editor の画面から作り直す
```

> [!NOTE]
> チャットから接続した Linux VM では Mac の `node_modules` を使えません（OS ごとに native binding が違う）。VM で動かすときは別の場所に rsync して `npm ci` します。`deploy.yml` は手動実行だけで、リポジトリが Private の間は GitHub Pages に配備できません。
