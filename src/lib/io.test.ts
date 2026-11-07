import { describe, expect, it } from 'vitest';
import { validateManual, type Manual } from '@shuji-bonji/experiential-manual-model';
import { parseManualText, serializeManual } from './io';
import {
  addAdmonition,
  addAsset,
  addHotspot,
  addScope,
  addScreen,
  addStep,
  addTopic,
  setScopeRef,
  setTransition,
  updateHotspot
} from './ops';
import { locateIssue } from './issues';
import { loadKenbaiki, loadLegacyText } from './fixtures';

describe('保存した JSON が validateManual を通る', () => {
  it('券売機の例を読み込み、編集して、保存して、もう一度読んでも通る', () => {
    const { manual: loaded, kind } = parseManualText(JSON.stringify(loadKenbaiki()));
    expect(kind).toBe('manual');
    expect(validateManual(loaded).ok).toBe(true);

    // 編集: Topic・素材・画面・ホットスポット・遷移・Scope・手順・注意書き
    let m: Manual = loaded;
    const flow = addTopic(m, 'screenFlow', '払い戻し');
    m = flow.manual;
    const a1 = addAsset(m, { filename: 'refund1.png', mediaType: 'image/png', hash: 'sha256:00' });
    const a2 = addAsset(a1.manual, { filename: 'refund2.png', mediaType: 'image/png' });
    m = a2.manual;
    const s1 = addScreen(m, flow.id, a1.id, 'STEP1');
    const s2 = addScreen(s1.manual, flow.id, a2.id, 'STEP2');
    m = s2.manual;
    const h = addHotspot(m, flow.id, s1.id, { shape: 'rect', coords: [800, 100, 900, 200], label: '払い戻し' });
    m = setTransition(h.manual, flow.id, s1.id, h.id, s2.id);
    const c = addHotspot(m, flow.id, s2.id, { shape: 'circle', coords: [100, 100, 40], label: '戻る' });
    m = setTransition(c.manual, flow.id, s2.id, c.id, 'scr-top'); // 別 Topic の画面へ
    m = updateHotspot(m, flow.id, s2.id, c.id, { action: 'press' });
    const sc = addScope(m, { property: 'model', values: ['MV-70'], displayText: 'MV-70' });
    m = setScopeRef(sc.manual, { kind: 'screen', topicId: flow.id, screenId: s1.id }, sc.id, true);
    const proc = addTopic(m, 'procedure', '用紙を補充する');
    m = addStep(proc.manual, proc.id, '扉を開ける').manual;
    m = addStep(m, proc.id, '鍵を回す', 'step-' + 1).manual;
    m = addAdmonition(m, { kind: 'step', topicId: proc.id, stepId: 'step-1' }, 'warning', '電源を切る');

    const text = serializeManual(m);
    expect(text.endsWith('\n')).toBe(true);
    const again = parseManualText(text).manual;
    const r = validateManual(again);
    expect(r.errors).toEqual([]);
    expect(again).toEqual(m);
  });

  it('画像を埋め込む保存でも通り、data に data URL が入り、path のファイル名は残る', () => {
    let m = addAsset(addTopic(loadKenbaiki(), 'description', 'x').manual, { filename: 'p.png' });
    const id = m.id;
    const out = serializeManual(m.manual, { [id]: 'data:image/png;base64,AAAA' });
    const back = parseManualText(out).manual;
    expect(back.assets?.find((a) => a.id === id)?.source).toMatchObject({
      path: 'p.png',
      data: 'data:image/png;base64,AAAA',
      mediaType: 'image/png'
    });
    expect(validateManual(back).errors).toEqual([]);
    // 埋め込まない保存では data が入らない
    expect(serializeManual(m.manual)).not.toContain('"data"');
    expect(serializeManual(m.manual)).toContain('"path": "p.png"');
  });
});

describe('2021 年の JSON を読む', () => {
  it('fromLegacyJson で変換し、警告を返す', () => {
    const r = parseManualText(loadLegacyText(), { newId: () => 'fixed-id', title: '旧作' });
    expect(r.kind).toBe('legacy');
    expect(r.manual.id).toBe('fixed-id');
    expect(r.manual.title).toBe('旧作');
    expect(r.manual.topics.length).toBeGreaterThan(0);
    // rect の coords に 5 つ目の値が付いた button が 2 件ある
    expect(r.warnings.length).toBeGreaterThanOrEqual(2);
    const v = validateManual(r.manual);
    expect(v.errors).toEqual([]);
  });

  it('manual-model でも 2021 年の形でもない JSON は例外にする', () => {
    expect(() => parseManualText('{"a":1}')).toThrow(/topics/);
    expect(() => parseManualText('[1]')).toThrow();
    expect(() => parseManualText('{')).toThrow(/JSON として読めません/);
  });

  it('壊れた manual-model の JSON も開ける（検査で直すため）', () => {
    const r = parseManualText('{"id":"x","title":"t","topics":[{"id":"a","kind":"bad","title":"t"}]}');
    expect(validateManual(r.manual).ok).toBe(false);
  });
});

describe('検査の場所から画面上の場所を求める', () => {
  const m = loadKenbaiki();
  it('ホットスポットの遷移先', () => {
    expect(locateIssue(m, '/topics/1/screens/1/hotspots/0/transition/to')).toEqual({
      topicId: 'topic-buy',
      screenId: 'scr-station',
      hotspotId: 'hs-station-next',
      area: 'topic'
    });
  });
  it('入れ子の手順', () => {
    expect(locateIssue(m, '/topics/2/steps/0/children/1/text')).toMatchObject({
      topicId: 'topic-open-door',
      stepId: m.topics[2].steps![0].children![1].id
    });
  });
  it('適用範囲・素材は library', () => {
    expect(locateIssue(m, '/scopes').area).toBe('library');
    expect(locateIssue(m, '/assets/0/source').area).toBe('library');
    expect(locateIssue(m, '').area).toBe('library');
  });
});
