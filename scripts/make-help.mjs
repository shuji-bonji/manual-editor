/**
 * editor のヘルプを、editor 自身の画面から生成する（体験型マニュアルの実例 1 冊目）。
 *
 * 使い方: npm run build && node scripts/make-help.mjs
 *   - build/ を vite preview で配り、Playwright（Chromium）で editor を操作して各画面を撮る
 *   - 画面の上のボタンの位置（data-testid の boundingBox）をそのまま Hotspot.coords に書く
 *   - static/help/help.manual.json と static/help/assets/*.png を書き出す（1 冊の構成は設計書 13.2 節）
 *   - UI を変えたら、もう一度これを実行すれば画面と座標が追いつく
 *
 * 出す Topic は 4 種を 1 つずつ: 画面の流れ（画面の見かた）、手順（描いてつなぐ）、説明（保存されるもの）、困ったとき。
 */
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from 'playwright';
import { validateManual } from '@shuji-bonji/experiential-manual-model';

const PORT = 4174;
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = new URL('../static/help/', import.meta.url).pathname;
const IMG = `${OUT}assets/`;
// 1400 px で撮ると player の中で縮んで文字が読めないので、editor の 3 列が収まる最小に近い幅で撮る
const VIEWPORT = { width: 1120, height: 720 };
const SCALE = 2; // 高精細で撮る。座標は画像の画素（CSS px × SCALE）
const LEGACY_DIR = new URL('../src/lib/fixtures/', import.meta.url).pathname; // 2021 年の JSON だけが入ったフォルダー
const VERSION = JSON.parse((await import('node:fs')).readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); // JST

// ---- preview を立てる ---------------------------------------------------------
const server = spawn('npx', ['vite', 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch(BASE)).ok) break;
  } catch {
    /* まだ */
  }
  await sleep(500);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: SCALE });
page.on('dialog', (d) => d.accept());
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));

rmSync(OUT, { recursive: true, force: true });
mkdirSync(IMG, { recursive: true });

// ---- 画面を撮る補助 ------------------------------------------------------------
const assets = [];
const screens = [];
let shot = 0;

/** data-testid などの locator の位置を、画像の画素の矩形にする */
async function rectOf(locator, pad = 2) {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`要素が見つかりません: ${locator}`);
  const r = (n) => Math.round(n * SCALE);
  return [r(box.x - pad), r(box.y - pad), r(box.x + box.width + pad), r(box.y + box.height + pad)];
}

/**
 * いまの画面を撮って Screen にする。
 * hotspots: { at: Locator, label, to?: screen id, action?: 'press'|'read' }
 */
async function capture({ id, caption, description, admonitions, hotspots }) {
  // 押せる場所が画面の外（スクロールの先）にあると座標が画像の外に出るので、先に見えるところまでスクロールしておく
  for (const h of hotspots) await h.at.scrollIntoViewIfNeeded();
  // 5 秒で消える知らせ（「保存しました」など）は、撮る時刻で写ったり写らなかったりするので、撮る前に閉じる
  await page.evaluate(() => document.querySelectorAll('[data-testid="toast"] button').forEach((b) => b.click()));
  await page.waitForTimeout(250);
  const file = `${String(++shot).padStart(2, '0')}-${id}.png`;
  const buf = await page.screenshot({ path: `${IMG}${file}`, type: 'png' });
  const assetId = `img-${id}`;
  assets.push({
    id: assetId,
    kind: 'image',
    source: {
      path: `assets/${file}`,
      mediaType: 'image/png',
      hash: 'sha256:' + createHash('sha256').update(buf).digest('hex'),
      width: VIEWPORT.width * SCALE,
      height: VIEWPORT.height * SCALE
    },
    alt: caption
  });
  const hs = [];
  for (const [i, h] of hotspots.entries()) {
    const coords = await rectOf(h.at);
    const hotspot = { id: `hs-${id}-${i + 1}`, label: h.label, shape: 'rect', coords };
    if (h.action) hotspot.action = h.action;
    if (h.to) hotspot.transition = { to: `scr-${h.to}` };
    if (h.selector) hotspot.capture = { selector: h.selector };
    hs.push(hotspot);
  }
  const screen = { id: `scr-${id}`, caption, assetRef: assetId, hotspots: hs };
  if (description) screen.description = description;
  if (admonitions) screen.admonitions = admonitions;
  screen.capture = { url: page.url(), viewport: VIEWPORT, capturedAt: new Date().toISOString() };
  for (const h of hs) {
    const [x1, y1, x2, y2] = h.coords;
    if (x1 < 0 || y1 < 0 || x2 > VIEWPORT.width * SCALE || y2 > VIEWPORT.height * SCALE)
      throw new Error(`ホットスポット「${h.label}」が画像の外にあります: ${h.coords.join(', ')}`);
  }
  screens.push(screen);
  return screen;
}

const tid = (id) => ({ at: page.getByTestId(id).first(), selector: `[data-testid="${id}"]` });
const topicRow = (n) => ({ at: page.getByTestId('tree-topic').nth(n), selector: `[data-testid="tree-topic"]:nth-of-type(${n + 1})` });

// ---- 1. 画面の流れ: 画面の見かた ---------------------------------------------------
process.on('uncaughtException', async (e) => {
  console.error(e);
  try {
    await page.screenshot({ path: `${OUT}failed.png` });
    console.error(`失敗時の画面: ${OUT}failed.png`);
  } catch {
    /* 撮れない */
  }
  server.kill();
  process.exit(1);
});
await page.goto(BASE + '/');
await page.getByTestId('file-menu').click();
await page.getByTestId('new').click();
await page.waitForTimeout(300);
await capture({
  id: 'start',
  caption: '起動した直後',
  description:
    '上の帯に「ファイル」のメニュー、左に構成ツリー、中央にステージ、右にインスペクター、下に引き出し（素材・遷移の地図・検査）があります。まずは「ヘルプ」の中の例を開くか、「Topic を追加」で作り始めます。',
  hotspots: [
    { ...tid('help'), label: 'ヘルプ（このマニュアル。例もここから開く）', to: 'help' },
    { ...tid('add-topic'), label: 'Topic を追加（種類は左のプルダウンで選ぶ）', action: 'read' },
    { ...tid('tree-root'), label: 'マニュアルの題名・版・適用範囲を編集する', to: 'root' },
    { ...tid('file-menu'), label: 'ファイル（新規作成・開く・保存のメニュー）', to: 'filemenu' }
  ]
});

await page.getByTestId('file-menu').click();
await page.waitForSelector('[data-testid="file-menu-list"]');
await capture({
  id: 'filemenu',
  caption: '「ファイル」のメニュー',
  description:
    '1 冊のマニュアルは、1 つのファイル（名前の末尾は .emanual）に保存します。画像も一緒に入ります。編集中の内容はブラウザーの中の作業場所に置かれ、利用者のファイルは「保存」を選ぶまで変わりません。',
  hotspots: [
    { ...tid('new'), label: '新規作成（空のマニュアルを作る）', action: 'read' },
    { ...tid('open'), label: '開く（保存したマニュアルのファイルを選ぶ）', action: 'read' },
    { ...tid('save'), label: '保存（開いたファイルに上書き、または保存先を選ぶ。選べないブラウザーではダウンロード）', action: 'read' },
    { ...tid('save-as'), label: '名前を付けて保存（保存先を選び直す）', action: 'read' },
    { ...tid('export-html'), label: 'HTML としてエクスポート（1 つの HTML に書き出す。受け取った人はブラウザーで開くだけで見られる）', action: 'read' },
    { ...tid('import-folder'), label: '展開したフォルダーから取り込む（マニュアルのファイルを展開して直したフォルダーを読み込む。フォルダーには書き戻さない）', action: 'read' },
    { ...tid('file-menu'), label: 'メニューを閉じる', to: 'start' }
  ]
});
await page.keyboard.press('Escape');

await page.getByTestId('help').click();
await page.waitForSelector('[data-testid="help-dialog"] .em-stage');
await capture({
  id: 'help',
  caption: 'ヘルプ',
  description:
    'このマニュアルです。目次から「画面の見かた」「画面の流れを作る」「保存されるもの」「困ったとき」を開けます。右上の「例:」から、このヘルプ自体や同梱の券売機の例を editor に読み込めます。',
  hotspots: [
    { ...tid('open-example'), label: '券売機の例を開く（同梱の小さな例）', to: 'example' },
    { ...tid('help-open-example'), label: 'このヘルプを例として開く', action: 'read' }
  ]
});
await page.getByTestId('open-example').click();
await page.waitForSelector('[data-testid="description-editor"]');
await capture({
  id: 'example',
  caption: '例を開いたところ（説明の Topic）',
  description:
    '構成ツリーに 4 つの Topic が並びます。印は種類を表します（▣ 画面の流れ、≡ 手順、¶ 説明、? 困ったとき）。選んだ Topic の中身が中央に出ます。説明の Topic は、見出し・段落・箇条書き・表・図・注意のブロックをその場で書きます。',
  hotspots: [
    { ...topicRow(1), label: '画面の流れの Topic を開く', to: 'screenflow' },
    { ...topicRow(2), label: '手順の Topic を開く', to: 'procedure' },
    { ...topicRow(3), label: '困ったときの Topic を開く', to: 'troubleshooting' },
    { ...tid('drawer-assets'), label: '素材の引き出しを開く', to: 'assets' }
  ]
});

await page.getByTestId('tree-topic').nth(1).click();
await page.waitForSelector('[data-testid="edit-stage"]');
await capture({
  id: 'screenflow',
  caption: '画面の流れの Topic（ステージ）',
  description:
    '中央のステージに画面の画像が出て、ホットスポット（押せる場所）が薄い枠で重なります。上の作図ツールで矩形・円・多角形を描き、右のインスペクターでラベルと遷移先を付けます。「体験」に切り替えると、利用者が見るとおりに押して進めます。',
  hotspots: [
    { ...tid('tool-rect'), label: '作図ツール（↖ 選択、□ 矩形、○ 円、⬠ 多角形、✋ 手のひら）', action: 'read' },
    { at: page.locator('[data-testid="edit-stage"] [data-hotspot]').first(), selector: '[data-testid="edit-stage"] [data-hotspot]', label: 'ホットスポットを押して選ぶ', to: 'hotspot' },
    { ...tid('mode-play'), label: '体験に切り替える', to: 'play' },
    { ...tid('tree-screen'), label: '構成ツリーの画面を選ぶ（● は開始画面）', action: 'read' },
    { ...tid('drawer-map'), label: '遷移の地図を開く', to: 'map' },
    { ...tid('drawer-check'), label: '検査を開く', to: 'check' }
  ]
});

await page.locator('[data-testid="edit-stage"] [data-hotspot]').first().click();
await page.waitForSelector('[data-testid="hotspot-form"]');
await capture({
  id: 'hotspot',
  caption: 'ホットスポットを選んだところ',
  description:
    '右のインスペクターにラベル・形・座標・操作（押す／入力／読む）・遷移先・適用範囲が出ます。遷移先には、この Topic の画面のほか、他の Topic の画面や手順も選べます。行き先の画面がまだ無いときは「新しい画面を追加して遷移先にする」で、撮った順に画面を足していけます。',
  admonitions: [{ level: 'note', text: 'ホットスポットは矢印キーで 1 px（Shift で 10 px）動かせます。Delete で消せます（元に戻すで復帰）。' }],
  hotspots: [
    { ...tid('hotspot-label'), label: 'ラベル（押せる場所の名前）', action: 'read' },
    { ...tid('hotspot-transition'), label: '遷移先（押したときに移る画面・手順）', action: 'read' },
    { ...tid('mode-play'), label: '体験に切り替える', to: 'play' },
    { ...tid('tool-select'), label: '選択ツールに戻る', to: 'screenflow' }
  ]
});

await page.getByTestId('mode-play').click();
await page.waitForSelector('[data-testid="play"]');
await capture({
  id: 'play',
  caption: '体験（利用者が見る形）',
  description:
    '編集中の画面を、そのまま利用者が見る形で試せます。ホットスポットを押すと遷移先へ進み、「戻る」「最初から」で履歴をたどれます。「編集」に戻すと、いま見ている画面が選ばれた状態になるので、「この遷移先の画面を直したい」が 1 回の切り替えでできます。',
  hotspots: [
    { ...tid('mode-edit'), label: '編集に戻る（いま見ている画面が選ばれる）', to: 'screenflow' },
    { at: page.locator('[data-testid="play"] [data-hotspot]').first(), selector: '[data-testid="play"] [data-hotspot]', label: 'ホットスポット（押すと遷移先へ）', action: 'read' }
  ]
});
await page.getByTestId('mode-edit').click();

await page.getByTestId('drawer-map').click();
await page.waitForSelector('[data-testid="flow-map"]');
await capture({
  id: 'map',
  caption: '遷移の地図',
  description:
    'Topic の画面をノード、遷移を辺にした図です。緑の点が開始画面、点線の弧は戻る遷移、ノードの上の名札は多くの画面から同じ画面へ戻る遷移です。開始画面から到達できない画面と、遷移先の無い遷移は赤く出ます。ノードを押すとその画面を選びます。',
  hotspots: [
    { at: page.getByTestId('map-node').first(), selector: '[data-testid="map-node"]', label: 'ノード（押すとその画面を選ぶ）', action: 'read' },
    { ...tid('drawer-check'), label: '検査を開く', to: 'check' },
    { ...tid('drawer-assets'), label: '素材を開く', to: 'assets' }
  ]
});

await page.getByTestId('drawer-check').click();
await page.waitForSelector('[data-testid="issues-panel"]');
await capture({
  id: 'check',
  caption: '検査',
  description:
    'manual-model の validateManual の結果です。エラー（参照切れ・必須の欠け）と警告（到達できない画面・使われていない素材）を Topic ごとに並べ、行を押すと該当の場所へ移ります。保存のたびに実行し、エラーがあっても保存は止めず、通知で知らせます。',
  hotspots: [
    { ...tid('drawer-assets'), label: '素材を開く', to: 'assets' },
    { ...tid('drawer-map'), label: '遷移の地図に戻る', to: 'map' }
  ]
});

await page.getByTestId('drawer-assets').click();
await page.waitForSelector('[data-testid="asset-card"]');
await capture({
  id: 'assets',
  caption: '素材',
  description:
    '画像の一覧です。使っている画面・手順の数と、使われていないもの・画像の無いものが分かります。追加は「画像を追加」、フォルダー、この引き出しやステージへのドロップ、スクリーンショットの貼り付け（Ctrl/⌘+V）のどれでもできます。カードを押すと右に素材の欄が出ます。',
  hotspots: [
    { ...tid('assets-add'), label: '画像を追加（ファイルを選ぶ）', action: 'read' },
    { at: page.getByTestId('asset-card').first().locator('.thumb'), selector: '[data-testid="asset-card"] .thumb', label: '素材を選ぶ', to: 'asset' },
    { ...tid('drawer-map'), label: '遷移の地図を開く', to: 'map' }
  ]
});

await page.getByTestId('asset-card').first().locator('.thumb').click();
await page.waitForSelector('[data-testid="asset-form"]');
await capture({
  id: 'asset',
  caption: '素材を選んだところ',
  description:
    '代替テキスト・出典、ファイル名と大きさ、使っている場所が出ます。「画像を差し替える」で別の画像に、「マスク（塗りつぶし）」で画面の一部（個人情報など）を黒く塗って置き換えます。塗りつぶした画像に置き換えると元の画像は残りません。',
  hotspots: [
    { ...tid('asset-mask'), label: 'マスク（矩形で囲んだ場所を塗りつぶす）', action: 'read' },
    { ...tid('asset-remove'), label: 'この素材を削除（参照は残り、検査に出る）', action: 'read' },
    { ...tid('tree-root'), label: 'マニュアルの情報へ', to: 'root' }
  ]
});

await page.getByTestId('drawer-assets').click(); // 閉じる
await page.getByTestId('tree-root').click();
await page.waitForSelector('[data-testid="manual-title"]');
await capture({
  id: 'root',
  caption: 'マニュアルの情報と適用範囲',
  description:
    '構成ツリーの先頭の「マニュアル」を選ぶと、題名・言語・版・説明と、適用範囲（Scope）を編集できます。適用範囲は「この機種だけ」「この設置場所だけ」の内容を示すもので、Topic・画面・手順・ブロックに付けると、体験で範囲を選んだときに絞り込まれます。',
  hotspots: [
    { ...tid('manual-title'), label: '題名', action: 'read' },
    { ...topicRow(1), label: '画面の流れの Topic へ戻る', to: 'screenflow' }
  ]
});

await page.getByTestId('tree-topic').nth(2).click();
await page.waitForSelector('[data-testid="procedure-editor"]');
await page.getByTestId('step-text').nth(1).click();
await page.waitForSelector('[data-testid="step-form"]');
await capture({
  id: 'procedure',
  caption: '手順の Topic',
  description:
    '手順は番号付きの一覧で、文がそのまま入力欄です。Enter で次の手順、Tab で一段深く、Shift+Tab で一段浅く、空の手順で Backspace すると消えます。結果（→）と注意（⚠）は行の中に書き、図は下の「素材」のカードを手順にドラッグして付けます。右のインスペクターで操作対象・分岐・適用範囲を指定します。',
  hotspots: [
    { ...tid('step-text'), label: '手順の文（Enter で次の手順、Tab で一段深く）', action: 'read' },
    { ...tid('add-branch'), label: '分岐（条件と行き先）を足す', action: 'read' },
    { ...topicRow(3), label: '困ったときの Topic へ', to: 'troubleshooting' },
    { ...topicRow(1), label: '画面の流れの Topic へ戻る', to: 'screenflow' }
  ]
});

await page.getByTestId('tree-topic').nth(3).click();
await page.waitForSelector('[data-testid="step-question"]');
await capture({
  id: 'troubleshooting',
  caption: '困ったときの Topic',
  description:
    '問い（Q.）と答えの木です。答えごとに行き先（次の問い、対処の手順、画面）を選びます。問いの無い手順は「対処」で、体験ではそこで問答が終わります。',
  hotspots: [
    { ...tid('step-question'), label: '問い', action: 'read' },
    { ...tid('add-answer'), label: '答えを足す（文と行き先）', action: 'read' },
    { ...topicRow(1), label: '画面の流れの Topic へ戻る', to: 'screenflow' }
  ]
});

// ---- 2021 年の JSON の地図（規模の大きい例として図に使う） ------------------------------
await page.getByTestId('import-folder-input').setInputFiles(LEGACY_DIR);
await page.waitForSelector('[data-testid="tree-topic"]');
await page.getByTestId('tree-topic').nth(2).click();
await page.getByTestId('drawer-map').click();
await page.waitForSelector('[data-testid="flow-map"]');
await page.getByRole('button', { name: '幅に合わせる' }).click();
await capture({
  id: 'bigmap',
  caption: '23 画面の Topic の遷移の地図',
  description: '2021 年の作品（79 画面・212 ボタン）を読み込んだところ。「幅に合わせる」で全体を収めてから、拡大して見ます。',
  hotspots: [{ ...tid('drawer-check'), label: '検査を開く', action: 'read' }]
});

await browser.close();
server.kill();

// ---- Manual を組み立てる -------------------------------------------------------
const img = (id) => `img-${id}`;
const manual = {
  id: 'manual-editor-help',
  title: 'manual-editor の使い方',
  language: 'ja',
  version: { number: VERSION, date: today },
  description:
    '体験型マニュアルの作成ツール manual-editor のヘルプです。このヘルプ自体が manual-editor で開ける体験型マニュアル（experiential-manual-model の JSON）で、画面と押せる場所の座標は scripts/make-help.mjs が editor の画面から生成しています。',
  scopes: [],
  assets,
  topics: [
    {
      id: 'topic-screens',
      kind: 'screenFlow',
      title: '画面の見かた',
      summary: '起動から保存までの画面を、押しながらたどります。',
      startScreenRef: 'scr-start',
      screens: screens.filter((s) => s.id !== 'scr-bigmap')
    },
    {
      id: 'topic-make',
      kind: 'procedure',
      title: '画面の流れを作る',
      summary: 'スクリーンショットを並べ、押せる場所を描き、遷移先をつないで、体験で確かめるまで。',
      steps: [
        {
          id: 'st-topic',
          text: '「Topic を追加」の左のプルダウンで「画面の流れ」を選び、「Topic を追加」を押す',
          expected: '構成ツリーに新しい Topic が入り、右のインスペクターに題名の欄が出る',
          assetRefs: [img('start')]
        },
        {
          id: 'st-images',
          text: '画面の画像を足す',
          expected: '画像 1 枚につき画面が 1 つできる。最初の 1 枚が開始画面（●）になる',
          assetRefs: [img('screenflow')],
          children: [
            { id: 'st-images-1', text: '構成ツリーの「画面を追加（画像を選ぶ）」でファイルを選ぶ（複数可）' },
            { id: 'st-images-2', text: 'または、画像ファイルをステージにドロップする' },
            { id: 'st-images-3', text: 'または、スクリーンショットを撮ってそのまま Ctrl/⌘+V で貼り付ける' }
          ],
          admonitions: [{ level: 'note', text: '画像は、ブラウザーの中の作業場所の assets/ にコピーされます。JSON には source.path（assets/ からの相対パス）と幅・高さが入ります。' }]
        },
        {
          id: 'st-draw',
          text: '作図ツールの □ を選び、画像の上の押せる場所をドラッグで囲む',
          expected: 'ホットスポットができ、インスペクターの「ラベル」にフォーカスが移る',
          assetRefs: [img('hotspot')],
          children: [
            { id: 'st-draw-1', text: 'ラベルに、押せる場所の名前を書く（例: 180 円）' },
            { id: 'st-draw-2', text: '遷移先のプルダウンで、押したときに移る画面を選ぶ。まだ無ければ「新しい画面を追加して遷移先にする」を選ぶ' },
            { id: 'st-draw-3', text: '説明だけで遷移しない場所は、操作を「読む」にする' }
          ],
          admonitions: [{ level: 'caution', text: '画像の大きさが違う画像に差し替えると、座標を縮尺で変換するかを聞かれます。「キャンセル」にすると座標はそのままです。' }]
        },
        {
          id: 'st-play',
          text: '「体験」に切り替え、ホットスポットを押して進む',
          expected: '遷移先の画面に移る。「編集」に戻すとその画面が選ばれている',
          assetRefs: [img('play')]
        },
        {
          id: 'st-map',
          text: '下の「遷移の地図」で全体を見て、赤いノード（到達できない画面）と赤い辺（遷移先が無い）を直す',
          assetRefs: [img('map')],
          next: [
            { to: 'st-draw', condition: '赤い箇所があるとき（ノードを押して、その画面のホットスポットを直す）' },
            { to: 'st-save' }
          ]
        },
        {
          id: 'st-save',
          text: '「ファイル」のメニューの「保存」で、マニュアルのファイル（.emanual）に書き出す',
          expected: '検査にエラーがあれば通知が出る（保存は止まらない）',
          admonitions: [{ level: 'note', text: 'ファイルには、マニュアルの中身と、マニュアルが使っている画像が入ります。このファイルを「開く」で選ぶと、画像ごと元に戻ります。' }]
        }
      ]
    },
    {
      id: 'topic-files',
      kind: 'description',
      title: '保存されるもの',
      summary: '保存するファイルの中身、画像の持ち方、前回の続き、検査。',
      blocks: [
        { kind: 'section', id: 'b-json', title: 'JSON の形', children: [
          { kind: 'para', id: 'b-json-1', text: '「保存」で書き出すのは、マニュアルのファイル（名前の末尾は .emanual）です。中身は、manual.json と画像のフォルダー assets/ を 1 つにまとめた zip で、拡張子を .zip に変えると展開できます。manual.json は experiential-manual-model の Manual です。1 冊のマニュアルに Topic（画面の流れ・手順・説明・困ったとき）が並び、画像は assets に、適用範囲は scopes に入ります。' },
          { kind: 'para', id: 'b-json-2', text: '2021 年の作品の JSON（purchaseTypes）も開けます。「展開したフォルダーから取り込む」で読むと新しい形に変換され、保存するとマニュアルのファイルになります。' },
          { kind: 'figure', id: 'b-json-3', assetRef: img('bigmap'), title: '2021 年の作品（79 画面・212 ボタン）を開き、遷移の地図を見たところ' }
        ] },
        { kind: 'section', id: 'b-img', title: '画像の持ち方', children: [
          { kind: 'list', id: 'b-img-1', items: [
            '取り込んだ画像は assets/ に入ります。manual.json の source.path に assets/ からの相対パス、width / height に大きさが入ります',
            '保存するファイルに入るのは、マニュアルが使っている画像だけです。素材の一覧から外した画像は入りません',
            '人に見せるだけなら、「HTML としてエクスポート」で 1 つの HTML にします。閲覧部品と画像が入っていて、ブラウザーで開くだけで見られます。編集してもらうときは、マニュアルのファイル（.emanual）を渡します',
            '「開く」は、中身が manual.json と assets/ だけのファイルを受け付けます。ほかのものが入っていると、理由を出して開きません',
            '展開して手で直したフォルダーは「展開したフォルダーから取り込む」で読み込みます。画像が assets/ の外にあれば、assets/ に揃えます。画像が見つからない素材は、下の「素材」の「画像をまとめて割り当てる」でファイルを選びます（ファイル名で照合します）'
          ] },
          { kind: 'figure', id: 'b-img-2', assetRef: img('assets'), title: '素材の引き出し' }
        ] },
        { kind: 'section', id: 'b-draft', title: '前回の続き', children: [
          { kind: 'para', id: 'b-draft-1', text: '編集した内容は、少し待ってからブラウザーの中の作業場所に書かれます。取り込んだ画像も作業場所にコピーされます。タブを閉じても、次に開いたときは前回の続きから始まります。利用者のファイルは、「保存」を押すまで変わりません。' }
        ] },
        { kind: 'section', id: 'b-check', title: '検査', children: [
          { kind: 'table', id: 'b-check-1', rows: [
            ['種類', '内容', '直し方'],
            ['エラー', '参照切れ（遷移先・素材・適用範囲）、必須の項目の欠け', '行を押して該当箇所へ。参照が切れた遷移は「参照が切れた遷移をすべて外す」'],
            ['警告', '到達できない画面、遷移の無い画面、使われていない素材・適用範囲', '「地図で見る」で地図に出す。素材は「使われていない素材を整理」']
          ] },
          { kind: 'admonition', id: 'b-check-2', level: 'note', title: '保存は止まりません', text: 'エラーがあっても保存はできます。通知で件数を知らせるだけです。' }
        ] }
      ]
    },
    {
      id: 'topic-trouble',
      kind: 'troubleshooting',
      title: '困ったとき',
      summary: '画像が出ない、体験で進まない、検査にエラーが出る。',
      steps: [
        { id: 'q-image', text: '画面に画像が出ず「画像なし」と表示されますか？', question: '画面に画像が出ず「画像なし」と表示されますか？', answers: [
          { text: 'はい', next: { to: 'r-image' } },
          { text: 'いいえ', next: { to: 'q-play' } }
        ] },
        { id: 'q-play', text: '体験でホットスポットを押しても進みませんか？', question: '体験でホットスポットを押しても進みませんか？', answers: [
          { text: 'はい', next: { to: 'r-play' } },
          { text: 'いいえ', next: { to: 'q-check' } }
        ] },
        { id: 'q-check', text: '検査にエラーが出ますか？', question: '検査にエラーが出ますか？', answers: [
          { text: 'はい', next: { to: 'r-check' } },
          { text: 'いいえ', next: { to: 'r-other' } }
        ] },
        { id: 'r-image', text: '下の「素材」の引き出しを開き、「画像をまとめて割り当てる」で画像ファイルを選びます。ファイル名が manual.json の source.path のファイル名と同じものが割り当てられます。1 つずつ割り当てるときは、素材を選んで「画像を割り当てる」です。', assetRefs: [img('assets')] },
        { id: 'r-play', text: 'そのホットスポットに遷移先が無いか、操作が「読む」になっています。下の「遷移の地図」の「遷移先なし」の数を確かめ、ノードを押して画面を選び、ホットスポットを選んでインスペクターで遷移先を選びます。', assetRefs: [img('map'), img('hotspot')] },
        { id: 'r-check', text: '検査の行を押すと該当の場所へ移ります。画面を消して遷移先が無くなったときは「参照が切れた遷移をすべて外す」で一度に外せます。素材の参照切れは、素材を足して画面の「画像を差し替える」で付け直します。', assetRefs: [img('check')] },
        { id: 'r-other', text: '上の帯の「ヘルプ」から、このマニュアルの「画面の見かた」を開いて、画面ごとの説明を読んでください。' }
      ]
    }
  ]
};

const v = validateManual(manual);
if (v.errors.length) {
  console.error('validateManual のエラー:', v.errors);
  process.exit(1);
}
writeFileSync(`${OUT}help.manual.json`, JSON.stringify(manual, null, 2) + '\n');
console.log(`書き出し: ${OUT}help.manual.json（画面 ${screens.length}、ホットスポット ${screens.reduce((n, s) => n + s.hotspots.length, 0)}、画像 ${assets.length}）`);
if (v.warnings.length) console.log('警告:', v.warnings.map((w) => w.message));
if (pageErrors.length) {
  console.error('ページのエラー:', pageErrors);
  process.exit(1);
}
