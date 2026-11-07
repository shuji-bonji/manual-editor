/**
 * runtime のテスト。券売機の例（experiential-manual-model の examples/kenbaiki.manual.json の写し）で、
 * 設計書 6 節の手順 2 の確かめ方「STEP1 → STEP2 → 戻る」を含めて確かめる。
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Manual } from '@shuji-bonji/experiential-manual-model';
import { describe, expect, it } from 'vitest';
import {
  applicableSteps,
  applicableTopics,
  createFlow,
  createProcedure,
  createTroubleshooting,
  isApplicable,
  listScopeProperties,
  parseScopeSelection,
  resolveTarget
} from '../src/runtime/index.js';

const here = dirname(fileURLToPath(import.meta.url));
// 例は model 0.2.0 の項目（capture・width など）を含む。runtime はそれらを読まないので、0.1.0 の型のまま扱う。
const manual = JSON.parse(readFileSync(join(here, 'fixtures/kenbaiki.manual.json'), 'utf8')) as Manual;

describe('scope', () => {
  it('Manual.scopes を property ごとにまとめる', () => {
    const props = listScopeProperties(manual);
    expect(props.map((p) => p.property)).toEqual(['model', 'site']);
    expect(props[0]?.values.map((v) => v.value)).toEqual(['MV-50', 'MV-60']);
    expect(props[1]?.values[0]).toEqual({ value: 'outdoor', displayText: '屋外設置' });
  });

  it('scope 属性の文字列を読む', () => {
    expect(parseScopeSelection('model=MV-50; site=outdoor')).toEqual({ model: 'MV-50', site: 'outdoor' });
    expect(parseScopeSelection('')).toEqual({});
    expect(parseScopeSelection(undefined)).toEqual({});
  });

  it('選んでいない property は絞り込まない', () => {
    expect(isApplicable(manual, ['scope-mv50'], {})).toBe(true);
    expect(isApplicable(manual, ['scope-mv50'], { site: 'outdoor' })).toBe(true);
  });

  it('同じ property の Scope は、どれかが選んだ値を含めば当てはまる', () => {
    expect(isApplicable(manual, ['scope-mv50', 'scope-mv60'], { model: 'MV-60' })).toBe(true);
    expect(isApplicable(manual, ['scope-mv50', 'scope-mv60'], { model: 'MV-70' })).toBe(false);
    expect(isApplicable(manual, ['scope-mv50'], { model: 'MV-60' })).toBe(false);
  });

  it('scopeRefs の無い Topic は残り、合わない Topic は消える', () => {
    const all = applicableTopics(manual, {}).map((t) => t.id);
    expect(all).toContain('topic-open-door');
    const mv70 = applicableTopics(manual, { model: 'MV-70' }).map((t) => t.id);
    expect(mv70).not.toContain('topic-open-door');
    expect(mv70).toContain('topic-buy');
  });

  it('手順の木を絞り込んでも元の Manual は変わらない', () => {
    const topic = manual.topics.find((t) => t.id === 'topic-open-door');
    const steps = topic?.steps ?? [];
    const before = JSON.stringify(steps);
    const filtered = applicableSteps(
      { ...manual, scopes: [{ id: 's', property: 'p', values: ['a'], displayText: 'a' }] },
      [{ id: 'x', text: 'x', scopeRefs: ['s'] }, ...steps],
      { p: 'b' }
    );
    expect(filtered.map((s) => s.id)).toEqual(steps.map((s) => s.id));
    expect(JSON.stringify(steps)).toBe(before);
  });
});

describe('lookup', () => {
  it('Transition.to を画面か手順として解決する', () => {
    expect(resolveTarget(manual, 'scr-top')?.kind).toBe('screen');
    const step = resolveTarget(manual, 'stp-open-1-2');
    expect(step?.kind).toBe('step');
    if (step?.kind === 'step') {
      expect(step.topic.id).toBe('topic-open-door');
      expect(step.parents.map((p) => p.id)).toEqual(['stp-open-1']);
    }
    expect(resolveTarget(manual, 'nowhere')).toBeUndefined();
  });
});

describe('flow（画面遷移）', () => {
  it('STEP1 → STEP2 → 戻る', () => {
    const flow = createFlow(manual, 'topic-buy');
    expect(flow).toBeDefined();
    if (!flow) return;
    expect(flow.get().screen?.caption).toBe('STEP1');
    expect(flow.get().canBack).toBe(false);

    const r = flow.press('hs-top-transfer');
    expect(r.type).toBe('moved');
    expect(flow.get().screen?.caption).toBe('STEP2');
    expect(flow.get().trail).toEqual(['scr-top', 'scr-station']);
    expect(flow.get().position).toBe(1);

    flow.back();
    expect(flow.get().screen?.caption).toBe('STEP1');
    expect(flow.get().canBack).toBe(false);
  });

  it('最初から に戻す', () => {
    const flow = createFlow(manual, 'topic-buy');
    if (!flow) throw new Error('flow');
    flow.press('hs-top-transfer');
    flow.press('hs-station-next');
    expect(flow.get().screen?.caption).toBe('STEP3');
    flow.restart();
    expect(flow.get().trail).toEqual(['scr-top']);
  });

  it('条件付きの遷移は condition を添えて進む', () => {
    const flow = createFlow(manual, 'topic-buy', { startScreen: 'scr-payment' });
    if (!flow) throw new Error('flow');
    const r = flow.press('hs-payment-ic-short');
    expect(r).toMatchObject({ type: 'moved', condition: '残高が不足しているとき' });
    expect(flow.get().screen?.id).toBe('scr-shortage');
  });

  it('押せる場所の一覧に行き先が付く', () => {
    const flow = createFlow(manual, 'topic-buy', { startScreen: 'scr-station' });
    if (!flow) throw new Error('flow');
    const rows = flow.get().pressable;
    expect(rows.map((r) => r.hotspot.id)).toEqual(['hs-station-next', 'hs-station-cancel']);
    expect(rows[1]?.target).toMatchObject({ kind: 'screen', screen: { id: 'scr-top' } });
  });

  it('遷移の無い・行き先の無い・読むだけのホットスポット', () => {
    const m: Manual = {
      ...manual,
      topics: [
        {
          id: 't',
          kind: 'screenFlow',
          title: 't',
          screens: [
            {
              id: 's1',
              assetRef: 'img-top',
              hotspots: [
                { id: 'none', shape: 'rect', coords: [0, 0, 1, 1] },
                { id: 'lost', shape: 'rect', coords: [0, 0, 1, 1], transition: { to: 'nowhere' } },
                { id: 'label', shape: 'rect', coords: [0, 0, 1, 1], action: 'read', transition: { to: 's1' } }
              ]
            }
          ]
        }
      ]
    };
    const flow = createFlow(m, 't');
    if (!flow) throw new Error('flow');
    expect(flow.press('none').type).toBe('noTransition');
    expect(flow.press('lost')).toMatchObject({ type: 'notFound', to: 'nowhere' });
    expect(flow.press('label').type).toBe('read');
    expect(flow.press('ghost')).toMatchObject({ type: 'unknownHotspot', id: 'ghost' });
    expect(flow.get().trail).toEqual(['s1']);
  });

  it('when が付いた遷移は、選んだ値が合わないと進まない', () => {
    const m: Manual = {
      ...manual,
      topics: [
        {
          id: 't',
          kind: 'screenFlow',
          title: 't',
          screens: [
            {
              id: 's1',
              assetRef: 'img-top',
              hotspots: [
                {
                  id: 'h',
                  shape: 'rect',
                  coords: [0, 0, 1, 1],
                  transition: { to: 's2', when: { property: 'model', values: ['MV-60'] }, condition: 'MV-60 のとき' }
                }
              ]
            },
            { id: 's2', assetRef: 'img-top', hotspots: [] }
          ]
        }
      ]
    };
    const flow = createFlow(m, 't', { scope: { model: 'MV-50' } });
    if (!flow) throw new Error('flow');
    expect(flow.press('h')).toMatchObject({ type: 'notApplicable', condition: 'MV-60 のとき' });
    flow.setScope({ model: 'MV-60' });
    expect(flow.press('h').type).toBe('moved');
    flow.restart();
    flow.setScope({});
    expect(flow.press('h').type).toBe('moved');
  });

  it('行き先が手順のときは画面を変えず、行き先を返す', () => {
    const m: Manual = {
      ...manual,
      topics: [
        ...manual.topics,
        {
          id: 't',
          kind: 'screenFlow',
          title: 't',
          screens: [
            { id: 's1', assetRef: 'img-top', hotspots: [{ id: 'h', shape: 'rect', coords: [0, 0, 1, 1], transition: { to: 'stp-open-2' } }] }
          ]
        }
      ]
    };
    const flow = createFlow(m, 't');
    if (!flow) throw new Error('flow');
    const r = flow.press('h');
    expect(r.type).toBe('step');
    if (r.type === 'step') expect(r.target.topic.id).toBe('topic-open-door');
    expect(flow.get().trail).toEqual(['s1']);
  });

  it('subscribe は今の値をすぐ渡し、変わるたびに渡す', () => {
    const flow = createFlow(manual, 'topic-buy');
    if (!flow) throw new Error('flow');
    const seen: string[] = [];
    const stop = flow.subscribe((s) => seen.push(s.screen?.caption ?? '?'));
    flow.press('hs-top-transfer');
    stop();
    flow.back();
    expect(seen).toEqual(['STEP1', 'STEP2']);
  });

  it('Topic が無い・画面が無いときは undefined', () => {
    expect(createFlow(manual, 'nowhere')).toBeUndefined();
    expect(createFlow(manual, 'topic-open-door')).toBeUndefined();
  });
});

describe('procedure（手順）', () => {
  it('番号は 1、1.1、1.2、1.3、2、3', () => {
    const p = createProcedure(manual, 'topic-open-door');
    if (!p) throw new Error('procedure');
    expect(p.get().steps.map((n) => n.number)).toEqual(['1', '1.1', '1.2', '1.3', '2', '3']);
    expect(p.get().current?.number).toBe('1');
  });

  it('次へ は次の行へ進み、Step.next があればそこへ進む', () => {
    const p = createProcedure(manual, 'topic-open-door');
    if (!p) throw new Error('procedure');
    expect(p.next()).toMatchObject({ type: 'moved', step: { number: '1.1' } });
    p.goTo('stp-open-2');
    expect(p.get().branches.map((b) => b.number)).toEqual(['3']);
    expect(p.next()).toMatchObject({ type: 'moved', step: { number: '3' } });
    expect(p.next()).toEqual({ type: 'end' });
    expect(p.get().canNext).toBe(false);
    expect(p.prev()).toBe(true);
    expect(p.get().current?.step.id).toBe('stp-open-2');
  });

  it('条件付きの分岐は choose で選ぶ', () => {
    const m: Manual = {
      ...manual,
      topics: [
        {
          id: 't',
          kind: 'procedure',
          title: 't',
          steps: [
            { id: 'a', text: 'a', next: [{ to: 'b', condition: '汚れがひどいとき' }, { to: 'c', condition: 'それ以外' }] },
            { id: 'b', text: 'b' },
            { id: 'c', text: 'c' }
          ]
        }
      ]
    };
    const p = createProcedure(m, 't');
    if (!p) throw new Error('procedure');
    const r = p.next();
    expect(r.type).toBe('choose');
    if (r.type === 'choose') expect(r.branches.map((b) => b.number)).toEqual(['2', '3']);
    expect(p.choose(1)).toMatchObject({ type: 'moved', step: { number: '3' } });
  });

  it('適用範囲で消えた手順は番号を詰め、今の位置は保つ', () => {
    const m: Manual = {
      ...manual,
      topics: [
        {
          id: 't',
          kind: 'procedure',
          title: 't',
          steps: [
            { id: 'a', text: 'a', scopeRefs: ['scope-mv50'] },
            { id: 'b', text: 'b' },
            { id: 'c', text: 'c' }
          ]
        }
      ]
    };
    const p = createProcedure(m, 't', { startStep: 'b' });
    if (!p) throw new Error('procedure');
    expect(p.get().current?.number).toBe('2');
    p.setScope({ model: 'MV-60' });
    expect(p.get().steps.map((n) => n.step.id)).toEqual(['b', 'c']);
    expect(p.get().current?.number).toBe('1');
    expect(p.get().current?.step.id).toBe('b');
  });
});

describe('troubleshooting（困ったとき）', () => {
  it('問いに答えて対処に着き、戻れる', () => {
    const ts = createTroubleshooting(manual, 'topic-no-ticket');
    if (!ts) throw new Error('troubleshooting');
    expect(ts.get().question?.question).toBe('用紙はありますか。');
    expect(ts.get().answers.map((a) => a.text)).toEqual(['ある', 'ない']);

    const r = ts.answer(1);
    expect(r.type).toBe('resolved');
    if (r.type === 'resolved' && r.target.kind === 'step') expect(r.target.step.id).toBe('ts-3');
    expect(ts.get().question).toBeUndefined();
    expect(ts.get().resolution).toMatchObject({ kind: 'step', step: { id: 'ts-3' } });
    expect(ts.get().history).toHaveLength(1);

    ts.back();
    expect(ts.get().question?.id).toBe('ts-1');
    expect(ts.get().canBack).toBe(false);
    expect(ts.answer(5)).toEqual({ type: 'noAnswer', index: 5 });
  });

  it('問いが続くときは question を返す', () => {
    const m: Manual = {
      ...manual,
      topics: [
        {
          id: 't',
          kind: 'troubleshooting',
          title: 't',
          steps: [
            { id: 'q1', text: 'q1', question: 'ランプは点いていますか', answers: [{ text: 'はい', next: { to: 'fix' } }, { text: 'いいえ', next: { to: 'q2' } }] },
            { id: 'q2', text: 'q2', question: 'プラグは差さっていますか', answers: [{ text: 'いいえ', next: { to: 'fix' } }] },
            { id: 'fix', text: '差し直す' }
          ]
        }
      ]
    };
    const ts = createTroubleshooting(m, 't');
    if (!ts) throw new Error('troubleshooting');
    expect(ts.answer(1)).toMatchObject({ type: 'question', step: { id: 'q2' } });
    expect(ts.answer(0)).toMatchObject({ type: 'resolved', target: { kind: 'step', step: { id: 'fix' } } });
    expect(ts.get().history.map((h) => h.step.id)).toEqual(['q1', 'q2']);
    ts.restart();
    expect(ts.get().question?.id).toBe('q1');
    expect(ts.get().history).toEqual([]);
  });
});
