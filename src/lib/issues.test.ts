import { describe, expect, it } from 'vitest';
import { validateManual } from '@shuji-bonji/experiential-manual-model';
import { describeLocation, glossIssue, locateIssue, toIssueRows } from './issues';
import { addHotspot, addScreen, addTopic, addAsset, newManual, removeScreen, setTransition } from './ops';
import { loadKenbaiki } from './fixtures';

describe('describeLocation: 場所を名前の列にする', () => {
  const m = loadKenbaiki();
  it('Topic › 画面 › ホットスポット', () => {
    const loc = locateIssue(m, '/topics/1/screens/1/hotspots/0/transition/to');
    const crumbs = describeLocation(m, loc);
    expect(crumbs[0]).toBe(m.topics[1].title);
    expect(crumbs[1]).toBe(m.topics[1].screens![1].caption);
    expect(crumbs[2]).toBe(m.topics[1].screens![1].hotspots[0].label);
  });
  it('素材は「素材 › 代替テキスト」', () => {
    const crumbs = describeLocation(m, locateIssue(m, '/assets', 'asset "img-top" is not used'));
    expect(crumbs).toEqual(['素材', m.assets!.find((a) => a.id === 'img-top')!.alt]);
  });
  it('入れ子の手順は手順の文', () => {
    const loc = locateIssue(m, '/topics/2/steps/0/children/1/text');
    const crumbs = describeLocation(m, loc);
    expect(crumbs[1]).toBe(m.topics[2].steps![0].children![1].text);
  });
});

describe('glossIssue: validateManual の文を日本語にする', () => {
  it('よく出る文は日本語になり、知らない文は undefined', () => {
    expect(glossIssue('screen "s2" cannot be reached from "s1"')).toContain('到達できません');
    expect(glossIssue('transition target "x" is not a screen or step id')).toContain('見つかりません');
    expect(glossIssue('asset "a" is not used')).toContain('使われていません');
    expect(glossIssue('rect needs 4 numbers [x1, y1, x2, y2], got 3')).toBe('矩形の座標は 4 numbers [x1, y1, x2, y2] が必要ですが、3 個です。');
    expect(glossIssue('something unexpected')).toBeUndefined();
  });
});

describe('toIssueRows: 実際の検査結果から一覧の行を作る', () => {
  it('画面を消して参照切れを作ると、エラーの行がその画面のホットスポットを指し、到達不可の警告は地図で見られる', () => {
    let m = newManual('m', 't');
    const topic = addTopic(m, 'screenFlow', '流れ');
    m = topic.manual;
    const asset = addAsset(m, { filename: 'a.png' });
    m = asset.manual;
    const s1 = addScreen(m, topic.id, asset.id, 'STEP1');
    m = s1.manual;
    const s2 = addScreen(m, topic.id, asset.id, 'STEP2');
    m = s2.manual;
    const s3 = addScreen(m, topic.id, asset.id, 'STEP3');
    m = s3.manual;
    const h = addHotspot(m, topic.id, s1.id, { shape: 'rect', coords: [0, 0, 1, 1], label: '次へ' });
    m = setTransition(h.manual, topic.id, s1.id, h.id, s2.id);
    m = removeScreen(m, topic.id, s2.id);
    const v = validateManual(m);
    const errs = toIssueRows(m, v.errors, 'err');
    expect(errs.some((r) => r.loc.hotspotId === h.id && r.text.includes('見つかりません'))).toBe(true);
    const warns = toIssueRows(m, v.warnings, 'warn');
    const unreachable = warns.find((r) => r.mappable);
    expect(unreachable?.loc.screenId).toBe(s3.id);
    expect(unreachable?.crumbs).toEqual(['流れ', 'STEP3']);
  });
});
