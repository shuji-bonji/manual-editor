import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { validateManual, type Manual } from '@shuji-bonji/experiential-manual-model';
import { buildFlowMap } from './flowmap';

/** scripts/make-help.mjs が生成したヘルプ（static/help/help.manual.json）が壊れていないことを確かめる */
const HELP = new URL('../../static/help/help.manual.json', import.meta.url).pathname;

describe('ヘルプ（editor 自身の体験型マニュアル）', () => {
  const manual = JSON.parse(readFileSync(HELP, 'utf8')) as Manual;

  it('validateManual に通り、警告も無い', () => {
    const v = validateManual(manual);
    expect(v.errors).toEqual([]);
    expect(v.warnings).toEqual([]);
  });

  it('4 種の Topic を 1 つずつ持ち、画面の流れはすべて開始画面から到達できる', () => {
    expect(manual.topics.map((t) => t.kind).sort()).toEqual(['description', 'procedure', 'screenFlow', 'troubleshooting']);
    const flow = manual.topics.find((t) => t.kind === 'screenFlow')!;
    const map = buildFlowMap(manual, flow);
    expect(map.unreachable).toBe(0);
    expect(map.broken).toBe(0);
    expect(flow.screens!.length).toBeGreaterThanOrEqual(10);
  });

  it('画像のファイルがすべてあり、幅・高さと hash が入っている。ホットスポットは画像の中に収まる', () => {
    const dir = new URL('../../static/help/', import.meta.url).pathname;
    for (const a of manual.assets ?? []) {
      expect(existsSync(dir + a.source.path), a.source.path).toBe(true);
      expect(a.source.width).toBeGreaterThan(0);
      expect(a.source.height).toBeGreaterThan(0);
      expect(a.source.hash).toMatch(/^sha256:/);
    }
    for (const t of manual.topics)
      for (const s of t.screens ?? []) {
        const a = manual.assets!.find((x) => x.id === s.assetRef)!;
        for (const h of s.hotspots) {
          const [x1, y1, x2, y2] = h.coords;
          expect(x2).toBeGreaterThan(x1);
          expect(y2).toBeGreaterThan(y1);
          expect(x2).toBeLessThanOrEqual(a.source.width!);
          expect(y2).toBeLessThanOrEqual(a.source.height!);
          expect(h.capture?.selector).toBeTruthy();
        }
      }
  });
});
