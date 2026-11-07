import { describe, expect, it } from 'vitest';
import { validateManual, type Manual } from '@shuji-bonji/experiential-manual-model';
import {
  OpError,
  addAdmonition,
  addAsset,
  addHotspot,
  addScope,
  addScreen,
  addStep,
  addTopic,
  collectIds,
  dropBrokenTransitions,
  findScreen,
  getScopeRefs,
  indentStep,
  moveScreen,
  moveStep,
  moveTopic,
  newManual,
  nextId,
  normalizeCoords,
  outdentStep,
  removeAdmonition,
  removeHotspot,
  removeScope,
  removeScreen,
  removeStep,
  removeTopic,
  removeUnusedAssets,
  setScopeRef,
  setStartScreen,
  setTransition,
  updateAdmonition,
  updateHotspot,
  updateManual,
  updateScreen,
  updateStep,
  updateTopic
} from './ops';
import { loadKenbaiki } from './fixtures';

const ok = (m: Manual) => validateManual(m);
const errorPaths = (m: Manual) => validateManual(m).errors.map((e) => e.path);

/** screenFlow の Topic と画面 2 枚（a → b）を持つ小さなマニュアル */
function small(): Manual {
  let m = newManual('m-1', 'テスト');
  m = addAsset(m, { filename: 'a.png', mediaType: 'image/png' }).manual;
  m = addAsset(m, { filename: 'b.png', mediaType: 'image/png' }).manual;
  const t = addTopic(m, 'screenFlow', '流れ');
  m = t.manual;
  const a = addScreen(m, t.id, 'asset-1', 'A');
  m = a.manual;
  const b = addScreen(m, t.id, 'asset-2', 'B');
  m = b.manual;
  const h = addHotspot(m, t.id, a.id, { shape: 'rect', coords: [10, 10, 50, 40], label: '次へ' });
  m = setTransition(h.manual, t.id, a.id, h.id, b.id);
  return m;
}

describe('id の採番', () => {
  it('未使用の最小の番号を使い、決定的である', () => {
    const m = newManual('m', 'x');
    expect(nextId(m, 'topic')).toBe('topic-1');
    const a = addTopic(m, 'procedure', 'p');
    expect(a.id).toBe('topic-1');
    expect(addTopic(a.manual, 'procedure', 'q').id).toBe('topic-2');
    // 入力は書き換えない
    expect(m.topics).toHaveLength(0);
  });

  it('既存の id と衝突しない（読み込んだサンプルの後ろに足す）', () => {
    const m = loadKenbaiki();
    const { manual, id } = addTopic(m, 'description', '新しい話題');
    expect(collectIds(m).has(id)).toBe(false);
    expect(ok(manual).ok).toBe(true);
  });
});

describe('Topic', () => {
  it('追加・題名の編集・kind の変更・並べ替え・削除ができる', () => {
    let m = newManual('m', 'x');
    const a = addTopic(m, 'procedure', '一');
    const b = addTopic(a.manual, 'screenFlow', '二');
    m = b.manual;
    expect(m.topics[1].screens).toEqual([]);
    m = updateTopic(m, a.id, { title: '一（改）', summary: '概要' });
    expect(m.topics[0].title).toBe('一（改）');
    m = updateTopic(m, a.id, { summary: '' });
    expect(m.topics[0].summary).toBeUndefined();
    m = moveTopic(m, a.id, 1);
    expect(m.topics.map((t) => t.id)).toEqual([b.id, a.id]);
    m = moveTopic(m, a.id, 1); // 端では何も起きない
    expect(m.topics.map((t) => t.id)).toEqual([b.id, a.id]);
    m = updateTopic(m, b.id, { kind: 'troubleshooting' });
    expect(m.topics[0].steps).toEqual([]);
    m = removeTopic(m, a.id);
    expect(m.topics.map((t) => t.id)).toEqual([b.id]);
    expect(() => removeTopic(m, 'nothing')).toThrow(OpError);
  });
});

describe('素材と画面', () => {
  it('同じファイル名の素材は path に番号を足す', () => {
    let m = newManual('m', 'x');
    m = addAsset(m, { filename: 'a.png' }).manual;
    m = addAsset(m, { filename: 'a.png' }).manual;
    expect(m.assets?.map((a) => a.source.path)).toEqual(['a.png', 'a-2.png']);
  });

  it('最初に足した画面が開始画面になり、並べ替え・開始画面の変更ができる', () => {
    const m = small();
    const t = m.topics[0];
    expect(t.startScreenRef).toBe('screen-1');
    const moved = moveScreen(m, t.id, 'screen-2', -1);
    expect(moved.topics[0].screens?.map((s) => s.id)).toEqual(['screen-2', 'screen-1']);
    expect(setStartScreen(m, t.id, 'screen-2').topics[0].startScreenRef).toBe('screen-2');
    expect(updateScreen(m, t.id, 'screen-1', { caption: 'STEP1', description: '説明' }).topics[0].screens?.[0]).toMatchObject({
      caption: 'STEP1',
      description: '説明'
    });
    // patch に無い項目は変えない
    expect(updateScreen(m, t.id, 'screen-1', { description: 'x' }).topics[0].screens?.[0].caption).toBe('A');
  });

  it('存在しない素材を指す画面は作れない', () => {
    const m = addTopic(newManual('m', 'x'), 'screenFlow', 't');
    expect(() => addScreen(m.manual, m.id, 'asset-9')).toThrow(OpError);
  });

  it('使われていない素材だけを取り除く', () => {
    let m = small();
    m = addAsset(m, { filename: 'unused.png' }).manual;
    expect(ok(m).warnings.some((w) => w.message.includes('asset-3'))).toBe(true);
    m = removeUnusedAssets(m);
    expect(m.assets?.map((a) => a.id)).toEqual(['asset-1', 'asset-2']);
  });
});

describe('ホットスポット', () => {
  it('矩形・円を manual-model の規則で追加する（rect は x1<x2、y1<y2）', () => {
    let m = small();
    const t = m.topics[0].id;
    const r = addHotspot(m, t, 'screen-2', { shape: 'rect', coords: [200.4, 150.6, 100, 50] });
    expect(findScreen(r.manual, 'screen-2')?.screen.hotspots[0].coords).toEqual([100, 50, 200, 151]);
    const c = addHotspot(r.manual, t, 'screen-2', { shape: 'circle', coords: [30, 40, 12.2], action: 'input' });
    m = c.manual;
    const hs = findScreen(m, 'screen-2')!.screen.hotspots;
    expect(hs[1]).toMatchObject({ shape: 'circle', coords: [30, 40, 12], action: 'input' });
    expect(ok(m).ok).toBe(true);
  });

  it('大きさが 0 の図形や個数の違う coords は拒否する', () => {
    expect(() => normalizeCoords('rect', [1, 1, 1, 9])).toThrow(OpError);
    expect(() => normalizeCoords('rect', [1, 1, 2])).toThrow(OpError);
    expect(() => normalizeCoords('circle', [1, 1, 0])).toThrow(OpError);
    expect(() => normalizeCoords('circle', [1, 1])).toThrow(OpError);
    expect(() => normalizeCoords('poly', [1, 1, 2, 2])).toThrow(OpError);
    expect(normalizeCoords('poly', [0, 0, 10, 0, 10, 10])).toEqual([0, 0, 10, 0, 10, 10]);
  });

  it('ラベル・操作の種類・座標を直し、削除できる', () => {
    let m = small();
    const t = m.topics[0].id;
    m = updateHotspot(m, t, 'screen-1', 'hotspot-1', { label: '進む', action: 'read', coords: [60, 60, 20, 20] });
    const h = findScreen(m, 'screen-1')!.screen.hotspots[0];
    expect(h).toMatchObject({ label: '進む', action: 'read', coords: [20, 20, 60, 60] });
    m = updateHotspot(m, t, 'screen-1', 'hotspot-1', { label: '', action: '' });
    expect(findScreen(m, 'screen-1')!.screen.hotspots[0].label).toBeUndefined();
    expect(findScreen(m, 'screen-1')!.screen.hotspots[0].action).toBeUndefined();
    m = removeHotspot(m, t, 'screen-1', 'hotspot-1');
    expect(findScreen(m, 'screen-1')!.screen.hotspots).toEqual([]);
    expect(() => removeHotspot(m, t, 'screen-1', 'hotspot-1')).toThrow(OpError);
  });

  it('遷移先を付け替え・外せる', () => {
    let m = small();
    const t = m.topics[0].id;
    expect(findScreen(m, 'screen-1')!.screen.hotspots[0].transition?.to).toBe('screen-2');
    m = setTransition(m, t, 'screen-1', 'hotspot-1', 'screen-1', { label: '戻る' });
    expect(findScreen(m, 'screen-1')!.screen.hotspots[0].transition).toEqual({ to: 'screen-1', label: '戻る' });
    m = setTransition(m, t, 'screen-1', 'hotspot-1', null);
    expect(findScreen(m, 'screen-1')!.screen.hotspots[0].transition).toBeUndefined();
  });
});

describe('参照が切れたとき validateManual が検出する', () => {
  it('遷移先の画面を消すと transition.to が errors に出る', () => {
    const m = removeScreen(small(), 'topic-1', 'screen-2');
    const e = validateManual(m).errors;
    expect(e.some((x) => x.path.endsWith('/hotspots/0/transition/to'))).toBe(true);
  });

  it('開始画面を消すと、残った最初の画面が開始画面になる（参照切れにならない）', () => {
    const m = removeScreen(small(), 'topic-1', 'screen-1');
    expect(m.topics[0].startScreenRef).toBe('screen-2');
    expect(errorPaths(m)).not.toContain('/topics/0/startScreenRef');
    const empty = removeScreen(m, 'topic-1', 'screen-2');
    expect(empty.topics[0].startScreenRef).toBeUndefined();
  });

  it('画面を持つ Topic を消すと、他の Topic からの遷移が errors に出る（kenbaiki に別 Topic から足して確かめる）', () => {
    let m = loadKenbaiki();
    const flow = addTopic(m, 'screenFlow', '別の流れ');
    m = flow.manual;
    const s = addScreen(m, flow.id, 'img-top', 'X');
    m = s.manual;
    const h = addHotspot(m, flow.id, s.id, { shape: 'rect', coords: [0, 0, 10, 10] });
    m = setTransition(h.manual, flow.id, s.id, h.id, 'scr-station'); // topic-buy の画面
    expect(ok(m).ok).toBe(true);
    m = removeTopic(m, 'topic-buy');
    expect(validateManual(m).errors.some((x) => x.message.includes('"scr-station"'))).toBe(true);
  });

  it('素材を参照している画面があるのに素材を消すと assetRef が errors に出る', () => {
    const m = small();
    const broken: Manual = { ...m, assets: m.assets!.filter((a) => a.id !== 'asset-1') };
    expect(validateManual(broken).errors.some((e) => e.message.includes('asset "asset-1"'))).toBe(true);
  });

  it('手順の targetRef はホットスポットを消すと警告に出る', () => {
    let m = small();
    const p = addTopic(m, 'procedure', '手順');
    m = addStep(p.manual, p.id, 'ボタンを押す').manual;
    m = updateStep(m, p.id, 'step-1', { targetRef: 'hotspot-1' });
    expect(validateManual(m).warnings.some((w) => w.message.includes('targetRef'))).toBe(false);
    m = removeHotspot(m, 'topic-1', 'screen-1', 'hotspot-1');
    expect(validateManual(m).warnings.some((w) => w.message.includes('targetRef "hotspot-1"'))).toBe(true);
  });

  it('dropBrokenTransitions は切れた遷移だけを外す', () => {
    const m = removeScreen(small(), 'topic-1', 'screen-2');
    const { manual, dropped } = dropBrokenTransitions(m);
    expect(dropped).toBe(1);
    expect(validateManual(manual).errors).toEqual([]);
    expect(dropBrokenTransitions(manual).dropped).toBe(0);
  });
});

describe('手順・注意書き', () => {
  function proc() {
    const p = addTopic(newManual('m', 'x'), 'procedure', '手順');
    return { m: p.manual, t: p.id };
  }

  it('手順を追加し、入れ子にし、並べ替え、段を上げ下げし、削除できる', () => {
    let { m, t } = proc();
    m = addStep(m, t, '一').manual;
    m = addStep(m, t, '二').manual;
    m = addStep(m, t, '二の一', 'step-2').manual;
    expect(m.topics[0].steps?.[1].children?.[0]).toMatchObject({ id: 'step-3', text: '二の一' });
    m = moveStep(m, t, 'step-2', -1);
    expect(m.topics[0].steps?.map((s) => s.id)).toEqual(['step-2', 'step-1']);
    // step-1 を直前の兄弟（step-2）の子にする
    m = indentStep(m, t, 'step-1');
    expect(m.topics[0].steps?.map((s) => s.id)).toEqual(['step-2']);
    expect(m.topics[0].steps?.[0].children?.map((s) => s.id)).toEqual(['step-3', 'step-1']);
    // step-3 を一段浅くする（親の直後）
    m = outdentStep(m, t, 'step-3');
    expect(m.topics[0].steps?.map((s) => s.id)).toEqual(['step-2', 'step-3']);
    // 子を持たなくなった親から children を消す
    m = outdentStep(m, t, 'step-1');
    expect(m.topics[0].steps?.[0].children).toBeUndefined();
    m = removeStep(m, t, 'step-3');
    expect(m.topics[0].steps?.map((s) => s.id)).toEqual(['step-2', 'step-1']);
    expect(ok(m).ok).toBe(true);
  });

  it('文・期待される結果・問いを直す。空にすると項目ごと消える', () => {
    let { m, t } = proc();
    m = addStep(m, t, '押す').manual;
    m = updateStep(m, t, 'step-1', { text: 'ボタンを押す', expected: '画面が変わる', question: '押せますか' });
    expect(m.topics[0].steps?.[0]).toMatchObject({ text: 'ボタンを押す', expected: '画面が変わる', question: '押せますか' });
    m = updateStep(m, t, 'step-1', { expected: '' });
    expect(m.topics[0].steps?.[0].expected).toBeUndefined();
  });

  it('注意書き（warning / caution / note）を手順にも画面にも付けられる', () => {
    let m = small();
    const p = addTopic(m, 'procedure', '手順');
    m = addStep(p.manual, p.id, '作業する').manual;
    const owner = { kind: 'step', topicId: p.id, stepId: 'step-1' } as const;
    m = addAdmonition(m, owner, 'warning', '感電に注意');
    m = addAdmonition(m, owner, 'note', '補足');
    m = updateAdmonition(m, owner, 1, { level: 'caution', text: '熱い' });
    expect(m.topics[1].steps?.[0].admonitions).toEqual([
      { level: 'warning', text: '感電に注意' },
      { level: 'caution', text: '熱い' }
    ]);
    m = removeAdmonition(m, owner, 0);
    m = removeAdmonition(m, owner, 0);
    expect(m.topics[1].steps?.[0].admonitions).toBeUndefined();
    m = addAdmonition(m, { kind: 'screen', topicId: 'topic-1', screenId: 'screen-1' }, 'note', '画面の注意');
    expect(findScreen(m, 'screen-1')?.screen.admonitions).toEqual([{ level: 'note', text: '画面の注意' }]);
    expect(ok(m).ok).toBe(true);
  });
});

describe('適用範囲（Scope）', () => {
  it('作成し、scopeRefs を付け外しできる。付けないと「使われていない」警告', () => {
    let m = small();
    const s = addScope(m, { property: 'model', values: ['MV-50'], displayText: 'MV-50' });
    m = s.manual;
    expect(ok(m).warnings.some((w) => w.message.includes(`scope "${s.id}" is not used`))).toBe(true);
    m = setScopeRef(m, { kind: 'topic', topicId: 'topic-1' }, s.id, true);
    m = setScopeRef(m, { kind: 'screen', topicId: 'topic-1', screenId: 'screen-1' }, s.id, true);
    expect(getScopeRefs(m, { kind: 'topic', topicId: 'topic-1' })).toEqual([s.id]);
    expect(ok(m).warnings.some((w) => w.message.includes('is not used'))).toBe(false);
    m = setScopeRef(m, { kind: 'topic', topicId: 'topic-1' }, s.id, false);
    expect(m.topics[0].scopeRefs).toBeUndefined();
  });

  it('適用範囲を消すと、すべての scopeRefs から外れ、validateManual が通る', () => {
    let m = loadKenbaiki();
    expect(JSON.stringify(m)).toContain('scope-mv50');
    m = removeScope(m, 'scope-mv50');
    expect(JSON.stringify(m)).not.toContain('scope-mv50');
    expect(ok(m).ok).toBe(true);
  });

  it('存在しない Scope を付けようとすると OpError', () => {
    expect(() => setScopeRef(small(), { kind: 'topic', topicId: 'topic-1' }, 'nope', true)).toThrow(OpError);
  });
});

describe('Manual の情報', () => {
  it('題名・言語・版を直せる', () => {
    const m = updateManual(newManual('m', 'x'), { title: '新題', language: 'en', versionNumber: '2.0', versionDate: '2026-10-28' });
    expect(m).toMatchObject({ title: '新題', language: 'en', version: { number: '2.0', date: '2026-10-28' } });
    expect(updateManual(m, { versionDate: '' }).version.date).toBeUndefined();
  });
});
