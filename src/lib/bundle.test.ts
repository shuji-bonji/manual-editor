import { describe, expect, it } from 'vitest';
import type { Manual } from '@shuji-bonji/experiential-manual-model';
import { buildBundle, bundleNameFrom, checkBundle, locateManual, normalizeAssetPaths, referencedPaths, splitBundle, suggestedBundleName } from './bundle';
import { unzip } from './zip';

describe('locateManual', () => {
  it('manual.json を選ぶ。最上位にフォルダーが 1 段あってもよい', () => {
    expect(locateManual(['manual.json', 'assets/a.png'])).toEqual({ root: '', path: 'manual.json' });
    expect(locateManual(['券売機/assets/a.png', '券売機/manual.json', '__MACOSX/券売機/._manual.json'])).toEqual({ root: '券売機/', path: '券売機/manual.json' });
  });

  it('manual.json が複数あれば、いちばん浅いものを選ぶ', () => {
    expect(locateManual(['old/manual.json', 'manual.json'])?.path).toBe('manual.json');
  });

  it('manual.json が無ければ *.manual.json、それも無ければ 1 つだけの .json を選ぶ', () => {
    expect(locateManual(['help/img/01.png', 'help/help.manual.json', 'help/other.json'])).toEqual({ root: 'help/', path: 'help/help.manual.json' });
    expect(locateManual(['legacy\\data.json', 'legacy\\img\\a.png'])).toEqual({ root: 'legacy/', path: 'legacy/data.json' });
    expect(locateManual(['a.json', 'b.json'])).toBeUndefined();
    expect(locateManual(['a.png', '.hidden/manual.json'])).toBeUndefined();
  });
});

describe('splitBundle', () => {
  it('manual の JSON と、そこからの相対パスのファイルに分ける。フォルダーの外と OS のごみは入れない', () => {
    const e = (path: string) => ({ path, data: path });
    const parts = splitBundle([e('m/manual.json'), e('m/assets/a.png'), e('m/img/b.png'), e('m/.DS_Store'), e('m/assets/Thumbs.db'), e('other/c.png'), e('__MACOSX/m/assets/._a.png')]);
    expect(parts?.manual.path).toBe('m/manual.json');
    expect(parts?.files.map((f) => f.path)).toEqual(['assets/a.png', 'img/b.png']);
  });

  it('JSON が決まらなければ undefined', () => {
    expect(splitBundle([{ path: 'a.png', data: 1 }])).toBeUndefined();
  });
});

const manual = (paths: (string | undefined)[]): Manual =>
  ({
    id: 'm',
    title: 't',
    version: { number: '1.0' },
    language: 'ja',
    topics: [],
    assets: paths.map((path, i) => ({ id: `a${i}`, kind: 'image', source: path === undefined ? { data: 'data:image/png;base64,AAAA' } : { path } }))
  }) as Manual;

describe('buildBundle', () => {
  it('manual.json と、Manual が指している画像だけを入れる', async () => {
    const m = manual(['assets/a.png', './assets/a.png', 'assets/b.png', 'https://example.com/c.png', '../d.png', undefined]);
    expect(referencedPaths(m)).toEqual(['assets/a.png', 'assets/b.png']);
    const store: Record<string, Uint8Array> = { 'assets/a.png': new Uint8Array([1, 2, 3]), 'assets/unused.png': new Uint8Array([9]) };
    const { zip, missing } = await buildBundle(m, '{"id":"m"}', async (p) => store[p]);
    expect(missing).toEqual(['assets/b.png']);
    const entries = await unzip(zip);
    expect(entries.map((e) => e.path)).toEqual(['manual.json', 'assets/a.png']);
    expect(new TextDecoder().decode(entries[0].data)).toBe('{"id":"m"}');
    expect(entries[1].data).toEqual(new Uint8Array([1, 2, 3]));
  });
});

describe('checkBundle', () => {
  const e = (path: string) => ({ path, data: path });

  it('manual.json と assets/ だけなら受け付ける。OS が足すファイルは無視する', () => {
    const r = checkBundle([e('manual.json'), e('assets/a.png'), e('assets/sub/b.png'), e('.DS_Store'), e('__MACOSX/._manual.json'), e('assets/Thumbs.db')]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.parts.files.map((f) => f.path)).toEqual(['assets/a.png', 'assets/sub/b.png']);
    expect(checkBundle([e('manual.json')]).ok).toBe(true);
  });

  it('最上位にフォルダーが 1 つだけあり、その中が同じ構成なら受け付ける', () => {
    const r = checkBundle([e('券売機/manual.json'), e('券売機/assets/a.png'), e('__MACOSX/券売機/._manual.json')]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.parts.manual.path).toBe('券売機/manual.json');
      expect(r.parts.files.map((f) => f.path)).toEqual(['assets/a.png']);
    }
  });

  it('manual.json が無ければ受け付けない（*.manual.json や、深い場所の manual.json は探さない）', () => {
    expect(checkBundle([e('help.manual.json'), e('assets/a.png')])).toEqual({ ok: false, reason: 'no-manual', paths: [] });
    expect(checkBundle([e('a/manual.json'), e('b/x.png')])).toEqual({ ok: false, reason: 'no-manual', paths: [] });
    expect(checkBundle([e('a/b/manual.json')])).toEqual({ ok: false, reason: 'no-manual', paths: [] });
    expect(checkBundle([])).toEqual({ ok: false, reason: 'no-manual', paths: [] });
  });

  it('manual.json と assets/ 以外のものが入っていれば受け付けず、その path を返す', () => {
    expect(checkBundle([e('manual.json'), e('assets/a.png'), e('img/b.png'), e('index.html')])).toEqual({ ok: false, reason: 'unexpected', paths: ['img/b.png', 'index.html'] });
    expect(checkBundle([e('m/manual.json'), e('m/notes.txt')])).toEqual({ ok: false, reason: 'unexpected', paths: ['notes.txt'] });
  });
});

describe('normalizeAssetPaths', () => {
  it('assets/ の外の path を assets/ の下に揃え、対応を返す。重なる名前には番号を足す', () => {
    const m = manual(['img/a.png', 'assets/a.png', 'other/a.png', 'b.png', 'img/a.png', 'https://example.com/c.png', undefined]);
    const r = normalizeAssetPaths(m);
    expect(r.manual.assets?.map((a) => a.source.path)).toEqual(['assets/a-2.png', 'assets/a.png', 'assets/a-3.png', 'assets/b.png', 'assets/a-2.png', 'https://example.com/c.png', undefined]);
    expect(r.moves).toEqual([
      { from: 'img/a.png', to: 'assets/a-2.png' },
      { from: 'other/a.png', to: 'assets/a-3.png' },
      { from: 'b.png', to: 'assets/b.png' }
    ]);
    expect(m.assets?.[0].source.path).toBe('img/a.png'); // 元の Manual は変えない
  });

  it('すべて assets/ の下なら、同じ Manual をそのまま返す', () => {
    const m = manual(['assets/a.png', './assets/b.png']);
    const r = normalizeAssetPaths(m);
    expect(r.manual).toBe(m);
    expect(r.moves).toEqual([]);
  });
});

describe('ファイル名', () => {
  it('題名から保存するファイル名の案を作る', () => {
    expect(suggestedBundleName('券売機の使い方')).toBe('券売機の使い方.emanual');
    expect(suggestedBundleName('a/b: c?')).toBe('a-b- c-.emanual');
    expect(suggestedBundleName('   ')).toBe('manual.emanual');
  });

  it('開いたファイルの名前から保存するファイル名を作る', () => {
    expect(bundleNameFrom('券売機.emanual')).toBe('券売機.emanual');
    expect(bundleNameFrom('kenbaiki.manual.json')).toBe('kenbaiki.emanual');
    expect(bundleNameFrom('legacy-2021.json')).toBe('legacy-2021.emanual');
    expect(bundleNameFrom('券売機.manual.zip')).toBe('券売機.emanual');
    expect(bundleNameFrom('backup.zip')).toBe('backup.emanual');
    expect(bundleNameFrom('help')).toBe('help.emanual');
  });
});
