/** テスト用: 同梱のサンプルを読む（Node 上で動くテストだけが使う） */
import { readFileSync } from 'node:fs';
import type { Manual } from '@shuji-bonji/experiential-manual-model';

export function loadKenbaiki(): Manual {
  return JSON.parse(
    readFileSync(new URL('../../static/examples/kenbaiki.manual.json', import.meta.url), 'utf8')
  ) as Manual;
}

export function loadLegacyText(): string {
  return readFileSync(new URL('./fixtures/legacy-2021.json', import.meta.url), 'utf8');
}
