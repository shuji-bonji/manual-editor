import { describe, expect, it } from 'vitest';
import { assetPath, isStorablePath, memoryStore, pathSegments } from './workspace';

describe('pathSegments', () => {
  it('manual.json からの相対パスを区切りにする', () => {
    expect(pathSegments('assets/a.png')).toEqual(['assets', 'a.png']);
    expect(pathSegments('a.png')).toEqual(['a.png']);
    expect(pathSegments('./img//01.png')).toEqual(['img', '01.png']);
    expect(pathSegments('img\\01.png')).toEqual(['img', '01.png']);
  });

  it('フォルダーの外を指す path は受け付けない', () => {
    for (const p of ['../a.png', 'assets/../../a.png', '/etc/a.png', '\\a.png', 'C:\\a.png', 'https://example.com/a.png', 'data:image/png;base64,AAAA', 'blob:abc', '', '.', undefined]) {
      expect(pathSegments(p), String(p)).toBeUndefined();
      expect(isStorablePath(p)).toBe(false);
    }
  });

  it('manual.json 自身は素材の置き場所にしない', () => {
    expect(pathSegments('manual.json')).toBeUndefined();
    expect(pathSegments('assets/manual.json')).toEqual(['assets', 'manual.json']);
  });
});

describe('assetPath', () => {
  it('ファイル名を assets/ の下に置く。フォルダーの部分は捨てる', () => {
    expect(assetPath('a.png')).toBe('assets/a.png');
    expect(assetPath('shots/2026/a.png')).toBe('assets/a.png');
    expect(assetPath('C:\\shots\\a.png')).toBe('assets/a.png');
  });
});

describe('memoryStore', () => {
  const png = (s: string) => new Blob([s], { type: 'image/png' });

  it('1 冊の manual.json と画像を読み書きする', async () => {
    const ws = memoryStore();
    expect(await ws.readManual('b1')).toBeUndefined();
    await ws.writeManual('b1', '{"id":"m"}');
    await ws.writeFile('b1', 'assets/a.png', png('A'));
    await ws.writeFile('b1', 'assets\\b.png', png('B'));
    expect(await ws.readManual('b1')).toBe('{"id":"m"}');
    expect(await (await ws.readFile('b1', './assets/a.png'))?.text()).toBe('A');
    expect(await ws.listFiles('b1')).toEqual(['assets/a.png', 'assets/b.png']);
    expect(await ws.listBooks()).toEqual(['b1']);
  });

  it('冊は互いに混ざらない', async () => {
    const ws = memoryStore();
    await ws.writeFile('b1', 'assets/a.png', png('1'));
    await ws.writeFile('b2', 'assets/a.png', png('2'));
    expect(await (await ws.readFile('b1', 'assets/a.png'))?.text()).toBe('1');
    expect(await (await ws.readFile('b2', 'assets/a.png'))?.text()).toBe('2');
    await ws.removeBook('b1');
    expect(await ws.readFile('b1', 'assets/a.png')).toBeUndefined();
    expect(await ws.listBooks()).toEqual(['b2']);
  });

  it('フォルダーの外を指す path には書かず、読むと undefined を返す', async () => {
    const ws = memoryStore();
    await expect(ws.writeFile('b1', '../a.png', png('x'))).rejects.toThrow();
    expect(await ws.readFile('b1', '../a.png')).toBeUndefined();
    await ws.removeFile('b1', '../a.png');
  });

  it('removeFile は無いファイルでも失敗しない', async () => {
    const ws = memoryStore();
    await ws.writeFile('b1', 'assets/a.png', png('A'));
    await ws.removeFile('b1', 'assets/a.png');
    await ws.removeFile('b1', 'assets/a.png');
    expect(await ws.listFiles('b1')).toEqual([]);
  });
});
