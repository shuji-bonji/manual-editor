import { describe, expect, it } from 'vitest';
import { crc32, looksLikeZip, unzip, zipStore } from './zip';

const enc = new TextEncoder();
const dec = new TextDecoder();

/** Python の zipfile（ZIP_DEFLATED）で作った zip。最上位にフォルダーが 1 段あり、__MACOSX とフォルダーだけの項目を含む */
const DEFLATED =
  'UEsDBBQAAAgIAOi+bl0WADVmKwAAACoAAAAVAAAA5Yi45aOy5qmfL21hbnVhbC5qc29uq1bKTFGyUspV0lEqySzJSVWyUnrasePp4k3PVs4HieUXZCYXK1lFx9YCAFBLAwQUAAAICADovm5djzOB2AgAAAD0AQAAFgAAAOWIuOWjsuapny9hc3NldHMvYS50eHRzdBwFIw0AAFBLAwQUAAAICADovm5dgxbcjAMAAAABAAAAIAAAAF9fTUFDT1NYL+WIuOWjsuapny8uX21hbnVhbC5qc29uqwAAUEsDBBQAAAgAAAAAIQAAAAAAAAAAAAAAAAAXAAAA5Yi45aOy5qmfL2Fzc2V0cy9lbXB0eS9QSwECFAMUAAAICADovm5dFgA1ZisAAAAqAAAAFQAAAAAAAAAAAAAAgAEAAAAA5Yi45aOy5qmfL21hbnVhbC5qc29uUEsBAhQDFAAACAgA6L5uXY8zgdgIAAAA9AEAABYAAAAAAAAAAAAAAIABXgAAAOWIuOWjsuapny9hc3NldHMvYS50eHRQSwECFAMUAAAICADovm5dgxbcjAMAAAABAAAAIAAAAAAAAAAAAAAAgAGaAAAAX19NQUNPU1gv5Yi45aOy5qmfLy5fbWFudWFsLmpzb25QSwECFAMUAAAIAAAAACEAAAAAAAAAAAAAAAAAFwAAAAAAAAAAAAAAgAHbAAAA5Yi45aOy5qmfL2Fzc2V0cy9lbXB0eS9QSwUGAAAAAAQABAAaAQAAEAEAAAAA';
const fromBase64 = (s: string) => new Uint8Array(Buffer.from(s, 'base64'));

describe('crc32', () => {
  it('よく知られた値と一致する', () => {
    expect(crc32(enc.encode('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });
});

describe('zipStore / unzip', () => {
  it('書いたものを読み戻せる（日本語の名前、空のファイル、バイナリー）', async () => {
    const bin = new Uint8Array(70_000).map((_, i) => (i * 31) & 0xff);
    const zip = zipStore(
      [
        { path: 'manual.json', data: enc.encode('{"title":"券売機"}') },
        { path: 'assets/画面 1.png', data: bin },
        { path: 'assets/empty.bin', data: new Uint8Array() }
      ],
      new Date(2026, 10, 14, 23, 59, 58)
    );
    expect(looksLikeZip(zip)).toBe(true);
    const back = await unzip(zip);
    expect(back.map((e) => e.path)).toEqual(['manual.json', 'assets/画面 1.png', 'assets/empty.bin']);
    expect(dec.decode(back[0].data)).toBe('{"title":"券売機"}');
    expect(back[1].data).toEqual(bin);
    expect(back[2].data.length).toBe(0);
  });

  it('中身が無い zip も読み書きできる', async () => {
    expect(await unzip(zipStore([]))).toEqual([]);
  });

  it('同じ path を 2 回入れると投げる', () => {
    const d = enc.encode('x');
    expect(() => zipStore([{ path: 'a', data: d }, { path: 'a', data: d }])).toThrow(/重なって/);
  });

  it('ほかの道具が deflate で作った zip を読める。フォルダーだけの項目は返さない', async () => {
    const entries = await unzip(fromBase64(DEFLATED));
    expect(entries.map((e) => e.path)).toEqual(['券売機/manual.json', '券売機/assets/a.txt', '__MACOSX/券売機/._manual.json']);
    expect(JSON.parse(dec.decode(entries[0].data))).toMatchObject({ id: 'm', title: '券売機' });
    expect(dec.decode(entries[1].data)).toBe('A'.repeat(500));
  });

  it('zip でないものと、壊れた zip は理由を付けて投げる', async () => {
    await expect(unzip(enc.encode('{"topics":[]}'))).rejects.toThrow(/zip として読めません/);
    const zip = zipStore([{ path: 'a.txt', data: enc.encode('hello') }]);
    const broken = zip.slice();
    broken[30 + 5 + 1] ^= 0xff; // 中身を 1 バイト変える
    await expect(unzip(broken)).rejects.toThrow(/壊れています/);
    expect(looksLikeZip(enc.encode('{"a":1}'))).toBe(false);
  });
});
