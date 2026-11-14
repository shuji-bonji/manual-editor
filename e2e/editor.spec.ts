/**
 * 主な流れの E2E（設計書 6 節の手順 8）。
 * 1. 開く → 描く → つなぐ → 体験 → 保存（新規のマニュアルで、画面の流れを 1 つ作る）
 * 2. 2021 年の JSON（79 画面）を開き、遷移の地図・検査・素材の引き出しが読める
 * 3. 券売機の例で、手順・困ったとき・説明を 1 つずつ書き足し、保存した JSON が検査に通る
 * 4. ヘルプ（editor 自身の体験型マニュアル）
 * 5. 作業場所（設計書 13 節）: 取り込んだ画像と編集中の内容が、再読み込みの後も残る
 */
import { readFileSync } from 'node:fs';
import { expect, test, type Download, type Page } from '@playwright/test';
import { validateManual, type Manual } from '@shuji-bonji/experiential-manual-model';
import { makePng } from './png';

const LEGACY = new URL('../src/lib/fixtures/legacy-2021.json', import.meta.url).pathname;

async function downloadedManual(page: Page, download: Promise<Download>): Promise<Manual> {
  await page.getByTestId('download').click();
  const d = await download;
  const path = await d.path();
  if (!path) throw new Error('ダウンロードのファイルがありません');
  return JSON.parse(readFileSync(path, 'utf8')) as Manual;
}

test.beforeEach(async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  await page.goto('/');
});

test('開く → 描く → つなぐ → 体験 → 保存', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  // 新規のマニュアルに、画面の流れの Topic を 1 つ足す
  await page.getByTestId('new').click();
  await page.getByTestId('add-topic').click();
  await expect(page.getByTestId('tree-topic')).toHaveCount(1);
  await expect(page.getByTestId('topic-title')).toHaveValue(/Topic/);

  // 画面を 2 枚足す（画像ファイルを選ぶ）
  await page.getByTestId('add-screen-input').setInputFiles([
    { name: 'step1.png', mimeType: 'image/png', buffer: makePng(800, 500) },
    { name: 'step2.png', mimeType: 'image/png', buffer: makePng(800, 500, [200, 120, 60]) }
  ]);
  await expect(page.getByTestId('tree-screen')).toHaveCount(2);
  await page.getByTestId('tree-screen').nth(0).click();
  await expect(page.getByTestId('edit-stage')).toContainText('STEP1');

  // 矩形のホットスポットを描く
  await page.getByTestId('tool-rect').click();
  const img = page.locator('[data-testid="screen-canvas"] img');
  const box = await img.boundingBox();
  if (!box) throw new Error('画面の画像が表示されていません');
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.6, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId('hotspot-form')).toBeVisible();
  await expect(page.getByTestId('hotspot-label')).toBeFocused();
  await page.getByTestId('hotspot-label').fill('180円');

  // 遷移先を STEP2 にする
  await page.getByTestId('hotspot-transition').selectOption({ label: 'STEP2' });
  await expect(page.getByTestId('issues')).toContainText(/問題なし|問題/);

  // 体験に切り替えてホットスポットを押すと STEP2 へ進み、編集に戻すと STEP2 が選ばれている
  await page.getByTestId('mode-play').click();
  const play = page.getByTestId('play');
  await expect(play.locator('[data-screen]')).toHaveCount(1);
  await play.locator('[data-hotspot]').first().click();
  await expect(play).toContainText('STEP2');
  await page.getByTestId('mode-edit').click();
  await expect(page.getByTestId('edit-stage')).toContainText('STEP2');

  // 保存（ダウンロード）した JSON が manual-model の検査に通る
  const manual = await downloadedManual(page, page.waitForEvent('download'));
  const v = validateManual(manual);
  expect(v.errors).toEqual([]);
  expect(manual.topics).toHaveLength(1);
  const screens = manual.topics[0].screens ?? [];
  expect(screens).toHaveLength(2);
  expect(screens[0].hotspots[0]).toMatchObject({ shape: 'rect', label: '180円', transition: { to: screens[1].id } });
  expect(manual.assets?.[0].source).toMatchObject({ path: 'assets/step1.png', width: 800, height: 500 });
  expect(errors).toEqual([]);
});

test('2021 年の JSON を開くと、遷移の地図・検査・素材が読める', async ({ page }) => {
  await page.getByTestId('open-input').setInputFiles(LEGACY);
  await expect(page.getByTestId('tree-topic')).toHaveCount(5);

  // 遷移の地図: 1 つ目の Topic は 14 画面
  await page.getByTestId('drawer-map').click();
  await expect(page.getByTestId('flow-map')).toBeVisible();
  await expect(page.getByTestId('map-node')).toHaveCount(14);
  await expect(page.getByTestId('map-unreachable')).toHaveCount(0);
  // ノードを押すとその画面が選ばれる
  const node = page.getByTestId('map-node').nth(2);
  const label = (await node.locator('text.label').textContent())?.replace('…', '').trim() ?? '';
  await node.click();
  await expect(page.getByTestId('edit-stage-empty').or(page.getByTestId('edit-stage'))).toBeVisible();
  await expect(page.locator('.tree .row-item.selected')).toContainText(label);

  // 画面を 1 枚消すと、地図に到達不可と参照切れが赤く出て、検査に項目が並ぶ
  await page.getByTestId('tree-screen').nth(1).click();
  await page.getByRole('button', { name: 'この画面を削除' }).click();
  await expect(page.getByTestId('map-unreachable')).toBeVisible();
  await expect(page.getByTestId('map-broken')).toBeVisible();
  await page.getByTestId('drawer-check').click();
  await expect(page.getByTestId('issue-err').first()).toBeVisible();
  await expect(page.getByTestId('issue-map').first()).toBeVisible();
  await page.getByTestId('issue-map').first().click();
  await expect(page.locator('.node.selected')).toHaveCount(1);
  await page.getByTestId('undo').click();

  // 素材: 画像の無い素材が一覧に出る
  await page.getByTestId('drawer-assets').click();
  await expect(page.getByTestId('asset-card').first()).toBeVisible();
  expect(await page.getByTestId('asset-card').count()).toBeGreaterThan(60);
});

test('券売機の例で、手順・困ったとき・説明を書き足して保存できる', async ({ page }) => {
  await page.getByTestId('help').click();
  await page.getByTestId('open-example').click();
  await expect(page.getByTestId('description-editor')).toBeVisible();
  const topics = page.getByTestId('tree-topic');

  // E-2 手順: 最後の手順で Enter → 文を書く → Tab で一段深く
  await topics.nth(2).click();
  await expect(page.getByTestId('procedure-editor')).toBeVisible();
  const before = await page.getByTestId('step-text').count();
  await page.getByTestId('step-text').last().click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('新しい手順です');
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('step-text')).toHaveCount(before + 1);
  await expect(page.locator('li.step.selected')).toHaveClass(/depth-1/);
  await page.locator('li.step.selected input.expected').fill('扉が開く');
  await page.getByTestId('add-branch').click();
  await expect(page.locator('[data-testid="branch"]')).toHaveCount(1);

  // E-4 困ったとき: 問いを足し、答えと行き先を付ける
  await topics.nth(3).click();
  await expect(page.getByTestId('step-question').first()).toBeVisible();
  await page.getByTestId('add-step').click();
  await page.keyboard.type('電源は入っていますか？');
  await page.getByTestId('add-answer').last().click();
  await page.getByTestId('answer-text').last().fill('いいえ');
  await page.getByTestId('answer-target').last().selectOption({ index: 1 });

  // E-3 説明: 段落と表を足す
  await topics.nth(0).click();
  await expect(page.getByTestId('description-editor')).toBeVisible();
  const blocks = await page.locator('[data-testid^="block-"]').count();
  await page.getByTestId('add-block-para').last().click();
  await page.keyboard.type('新しい段落です。');
  await page.getByTestId('add-block-table').last().click();
  await page.locator('[data-testid="block-table"]').last().locator('td input').first().fill('見出し A');
  await expect(page.locator('[data-testid^="block-"]')).toHaveCount(blocks + 2);

  // 保存した JSON に入っていて、検査に通る
  const manual = await downloadedManual(page, page.waitForEvent('download'));
  expect(validateManual(manual).errors).toEqual([]);
  const proc = manual.topics.find((t) => t.kind === 'procedure')!;
  const added = proc.steps!.flatMap((s) => s.children ?? []).find((s) => s.text === '新しい手順です');
  expect(added).toMatchObject({ expected: '扉が開く' });
  expect(added?.next).toHaveLength(1);
  const ts = manual.topics.find((t) => t.kind === 'troubleshooting')!;
  expect(ts.steps!.at(-1)).toMatchObject({ question: '電源は入っていますか？', text: '電源は入っていますか？' });
  expect(ts.steps!.at(-1)?.answers?.[0]).toMatchObject({ text: 'いいえ' });
  const desc = manual.topics.find((t) => t.kind === 'description')!;
  expect(desc.blocks!.some((b) => b.kind === 'para' && b.text === '新しい段落です。')).toBe(true);
  expect(desc.blocks!.some((b) => b.kind === 'table' && b.rows?.[0]?.[0] === '見出し A')).toBe(true);
});

test('ヘルプは editor 自身の体験型マニュアルで、押して進める', async ({ page }) => {
  await page.getByTestId('help').click();
  const dialog = page.getByTestId('help-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.em-stage')).toBeVisible();
  // 最初の画面の「例を開く」のホットスポットを押すと、次の画面へ進む
  const before = await dialog.locator('.em-stage').getAttribute('data-screen');
  await dialog.locator('[data-hotspot]').first().click();
  await expect(dialog.locator('.em-stage')).not.toHaveAttribute('data-screen', before ?? '');
  // 目次から手順・説明・困ったときを開ける
  await dialog.getByRole('button', { name: /画面の流れを作る/ }).click();
  await expect(dialog).toContainText('Topic を追加');
  await dialog.getByRole('button', { name: /困ったとき/ }).first().click();
  await expect(dialog).toContainText('画像なし');
  // 「例として開く」で editor に読み込める
  await page.getByTestId('help-open-example').click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('tree-topic')).toHaveCount(4);
  await expect(page.getByTestId('filename')).toContainText('help.manual.json');
});

/** 作業場所（OPFS）にある、いま開いている 1 冊の中身を読む */
async function workspaceBook(page: Page): Promise<{ manual: string; files: string[] } | undefined> {
  return page.evaluate(async () => {
    const raw = localStorage.getItem('experiential-manual-editor:session:v1');
    if (!raw) return undefined;
    const { bookId } = JSON.parse(raw) as { bookId: string };
    try {
      const root = await navigator.storage.getDirectory();
      const book = await (await root.getDirectoryHandle('books')).getDirectoryHandle(bookId);
      const manual = await (await (await book.getFileHandle('manual.json')).getFile()).text();
      const files: string[] = [];
      const walk = async (dir: FileSystemDirectoryHandle, prefix: string) => {
        // @ts-expect-error TypeScript の標準の型定義に、ディレクトリーの列挙が無い版がある
        for await (const [name, handle] of dir.entries()) {
          if (handle.kind === 'directory') await walk(handle, `${prefix}${name}/`);
          else files.push(prefix + name);
        }
      };
      await walk(book, '');
      return { manual, files: files.sort() };
    } catch {
      return undefined;
    }
  });
}

test('作業場所: 取り込んだ画像と編集中の内容が、再読み込みの後も残る', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.getByTestId('new').click();
  await page.getByTestId('add-topic').click();
  await page.getByTestId('add-screen-input').setInputFiles([
    { name: 'step1.png', mimeType: 'image/png', buffer: makePng(800, 500) },
    { name: 'step2.png', mimeType: 'image/png', buffer: makePng(640, 400, [200, 120, 60]) }
  ]);
  await expect(page.getByTestId('tree-screen')).toHaveCount(2);

  // 画像は assets/ にコピーされ、manual.json は少し待ってから書かれる
  await expect
    .poll(async () => (await workspaceBook(page))?.files, { timeout: 10_000 })
    .toEqual(['assets/step1.png', 'assets/step2.png', 'manual.json']);
  await expect.poll(async () => (await workspaceBook(page))?.manual ?? '', { timeout: 10_000 }).toContain('assets/step2.png');

  // 再読み込みすると、尋ねられずに続きから始まり、画像も表示される
  await page.reload();
  await expect(page.getByTestId('tree-screen')).toHaveCount(2);
  await page.getByTestId('tree-screen').nth(1).click();
  const img = page.locator('[data-testid="screen-canvas"] img');
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBe(640);
  await expect(page.getByTestId('draft-banner')).toHaveCount(0);

  // 保存した JSON の path は、manual.json からの相対パス（assets/…）
  const manual = await downloadedManual(page, page.waitForEvent('download'));
  expect(manual.assets?.map((a) => a.source.path)).toEqual(['assets/step1.png', 'assets/step2.png']);
  expect(validateManual(manual).errors).toEqual([]);

  // 新規にすると、前の 1 冊は作業場所から消える（一覧から選ぶ形は後の版）
  await page.getByTestId('new').click();
  await expect(page.getByTestId('tree-screen')).toHaveCount(0);
  await expect.poll(async () => (await workspaceBook(page))?.files, { timeout: 10_000 }).toEqual(['manual.json']);
  const books = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle('books');
    const names: string[] = [];
    // @ts-expect-error TypeScript の標準の型定義に、ディレクトリーの列挙が無い版がある
    for await (const name of dir.keys()) names.push(name);
    return names.length;
  });
  expect(books).toBe(1);
  expect(errors).toEqual([]);
});
