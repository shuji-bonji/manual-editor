import { describe, expect, it } from 'vitest';
import { validateManual, type Manual } from '@shuji-bonji/experiential-manual-model';
import { buildFlowMap, ellipsize, type MapNode } from './flowmap';
import { addHotspot, addScreen, addTopic, addAsset, newManual, setTransition } from './ops';
import { parseManualText } from './io';
import { loadKenbaiki, loadLegacyText } from './fixtures';

/** 画面 n 枚（STEP1〜STEPn）を持つ screenFlow の Topic。遷移はまだ無い */
function flowWith(n: number): { manual: Manual; topicId: string; screens: string[] } {
  let m = newManual('m', 'test');
  const t = addTopic(m, 'screenFlow', '流れ');
  m = t.manual;
  const a = addAsset(m, { filename: 'a.png', mediaType: 'image/png', width: 800, height: 600 });
  m = a.manual;
  const screens: string[] = [];
  for (let i = 1; i <= n; i++) {
    const s = addScreen(m, t.id, a.id, `STEP${i}`);
    m = s.manual;
    screens.push(s.id);
  }
  return { manual: m, topicId: t.id, screens };
}

function link(m: Manual, topicId: string, from: string, to: string, label = '次へ'): Manual {
  const h = addHotspot(m, topicId, from, { shape: 'rect', coords: [0, 0, 10, 10], label });
  return setTransition(h.manual, topicId, from, h.id, to);
}

const topicOf = (m: Manual, id: string) => m.topics.find((t) => t.id === id)!;
const nodeOf = (nodes: MapNode[], id: string) => nodes.find((n) => n.id === id)!;

describe('buildFlowMap: 階層と到達可否', () => {
  it('開始画面が階層 0、遷移でたどれる画面は深さの順に右へ並ぶ', () => {
    const f = flowWith(4);
    let m = f.manual;
    const [s1, s2, s3, s4] = f.screens;
    m = link(m, f.topicId, s1, s2);
    m = link(m, f.topicId, s2, s3);
    m = link(m, f.topicId, s2, s4);
    const map = buildFlowMap(m, topicOf(m, f.topicId));
    expect(nodeOf(map.nodes, s1).layer).toBe(0);
    expect(nodeOf(map.nodes, s1).start).toBe(true);
    expect(nodeOf(map.nodes, s2).layer).toBe(1);
    expect(nodeOf(map.nodes, s3).layer).toBe(2);
    expect(nodeOf(map.nodes, s4).layer).toBe(2);
    expect(map.unreachable).toBe(0);
    expect(map.broken).toBe(0);
    expect(map.edges).toHaveLength(3);
    expect(map.edges.every((e) => e.kind === 'forward')).toBe(true);
    // 同じ階層のノードは縦に重ならない
    const l2 = map.nodes.filter((n) => n.layer === 2).sort((a, b) => a.y - b.y);
    expect(l2[1].y).toBeGreaterThanOrEqual(l2[0].y + l2[0].h);
  });

  it('開始画面から到達できない画面は unreachable になり、右の階層に置かれる（validateManual の警告と同じ数）', () => {
    const f = flowWith(3);
    let m = f.manual;
    const [s1, s2, s3] = f.screens;
    m = link(m, f.topicId, s1, s2);
    // s3 へ行く遷移が無い
    const map = buildFlowMap(m, topicOf(m, f.topicId));
    expect(nodeOf(map.nodes, s3).unreachable).toBe(true);
    expect(nodeOf(map.nodes, s3).layer).toBeGreaterThan(nodeOf(map.nodes, s2).layer);
    expect(map.unreachable).toBe(1);
    const warnings = validateManual(m).warnings.filter((w) => w.message.includes('cannot be reached'));
    expect(warnings).toHaveLength(map.unreachable);
  });

  it('遷移先の無いホットスポットは dangling、見つからない遷移先は missing ノードと broken の辺になる', () => {
    const f = flowWith(2);
    let m = f.manual;
    const [s1, s2] = f.screens;
    m = link(m, f.topicId, s1, s2);
    m = link(m, f.topicId, s2, 'nowhere', '消えた画面へ');
    // 遷移の無いホットスポット（press）と、read のホットスポット（数えない）
    m = addHotspot(m, f.topicId, s2, { shape: 'rect', coords: [0, 0, 5, 5], label: '未設定' }).manual;
    m = addHotspot(m, f.topicId, s2, { shape: 'rect', coords: [0, 0, 5, 5], label: '説明', action: 'read' }).manual;
    const map = buildFlowMap(m, topicOf(m, f.topicId));
    const missing = map.nodes.find((n) => n.kind === 'missing');
    expect(missing?.label).toBe('nowhere');
    expect(missing?.layer).toBe(2);
    expect(nodeOf(map.nodes, s2).dangling).toBe(1);
    expect(nodeOf(map.nodes, s2).broken).toBe(1);
    expect(map.broken).toBe(1);
    expect(map.edges.find((e) => e.to === 'missing:nowhere')?.broken).toBe(true);
  });

  it('他の Topic の画面への遷移は external ノードになり、押すとその Topic の画面を選べる', () => {
    const f = flowWith(1);
    let m = f.manual;
    const other = addTopic(m, 'screenFlow', '別の流れ');
    m = other.manual;
    const asset = m.assets![0].id;
    const os = addScreen(m, other.id, asset, 'HOME');
    m = os.manual;
    m = link(m, f.topicId, f.screens[0], os.id, 'ホームへ');
    const map = buildFlowMap(m, topicOf(m, f.topicId));
    const ext = map.nodes.find((n) => n.kind === 'external');
    expect(ext?.label).toBe('HOME');
    expect(ext?.sub).toBe('別の流れ');
    expect(ext?.target).toEqual({ topicId: other.id, screenId: os.id });
    expect(map.edges[0].external).toBe(true);
  });

  it('戻る遷移は back、同じ画面への遷移は self、同じ階層への遷移は same になり、同じ 2 画面の間の遷移は 1 本にまとまる', () => {
    const f = flowWith(3);
    let m = f.manual;
    const [s1, s2, s3] = f.screens;
    m = link(m, f.topicId, s1, s2, '180円');
    m = link(m, f.topicId, s1, s2, '220円');
    m = link(m, f.topicId, s1, s3, '定期');
    m = link(m, f.topicId, s2, s1, 'とりけし');
    m = link(m, f.topicId, s2, s2, '再表示');
    m = link(m, f.topicId, s2, s3, '次へ');
    const map = buildFlowMap(m, topicOf(m, f.topicId));
    const e12 = map.edges.find((e) => e.from === s1 && e.to === s2)!;
    expect(e12.count).toBe(2);
    expect(e12.labels).toEqual(['180円', '220円']);
    expect(map.edges.find((e) => e.from === s2 && e.to === s1)?.kind).toBe('back');
    expect(map.edges.find((e) => e.from === s2 && e.to === s2)?.kind).toBe('self');
    expect(map.edges.find((e) => e.from === s2 && e.to === s3)?.kind).toBe('same');
    // 戻る辺があるので、図の高さは下に余白を持つ
    const bottom = Math.max(...map.nodes.map((n) => n.y + n.h));
    expect(map.height).toBeGreaterThan(bottom + 24);
  });

  it('画面の無い Topic でも空の地図を返す', () => {
    let m = newManual('m', 't');
    const t = addTopic(m, 'screenFlow', '空');
    m = t.manual;
    const map = buildFlowMap(m, topicOf(m, t.id));
    expect(map.nodes).toHaveLength(0);
    expect(map.edges).toHaveLength(0);
    expect(map.width).toBeGreaterThan(0);
  });
});

describe('buildFlowMap: 実例', () => {
  it('券売機の例の「乗換案内からきっぷを買う」は、4 画面がすべて開始画面から到達できる', () => {
    const m = loadKenbaiki();
    const topic = m.topics.find((t) => t.kind === 'screenFlow')!;
    const map = buildFlowMap(m, topic);
    expect(map.nodes.filter((n) => n.kind === 'screen')).toHaveLength(topic.screens!.length);
    expect(map.unreachable).toBe(0);
    expect(map.broken).toBe(0);
    for (const e of map.edges) {
      expect(map.nodes.some((n) => n.id === e.from)).toBe(true);
      expect(map.nodes.some((n) => n.id === e.to)).toBe(true);
    }
  });

  it('2021 年の JSON（5 Topic・79 画面）の地図は、どの Topic も重なり無く描ける', () => {
    const parsed = parseManualText(loadLegacyText(), { newId: () => 'legacy', title: 'legacy' });
    const m = parsed.manual;
    let screens = 0;
    for (const topic of m.topics) {
      const map = buildFlowMap(m, topic);
      screens += topic.screens?.length ?? 0;
      // すべての画面がノードになる
      expect(map.nodes.filter((n) => n.kind === 'screen')).toHaveLength(topic.screens!.length);
      // ノード同士は重ならない
      for (const a of map.nodes)
        for (const b of map.nodes) {
          if (a === b) continue;
          const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
          expect(overlap).toBe(false);
        }
      // 図の大きさの中に収まる
      for (const n of map.nodes) {
        expect(n.x + n.w).toBeLessThanOrEqual(map.width);
        expect(n.y + n.h).toBeLessThanOrEqual(map.height);
      }
      // validateManual の到達不可の警告と同じ数
      const unreachable = validateManual(m).warnings.filter(
        (w) => w.path.startsWith(`/topics/${m.topics.indexOf(topic)}/`) && w.message.includes('cannot be reached')
      );
      expect(map.unreachable).toBe(unreachable.length);
    }
    expect(screens).toBe(79);
  });
});

describe('ellipsize', () => {
  it('長さを超える文だけ切って … を付ける', () => {
    expect(ellipsize('STEP1', 10)).toBe('STEP1');
    expect(ellipsize('乗換案内からきっぷを購入する', 8)).toBe('乗換案内からき…');
  });
});

describe('buildFlowMap: 多くの画面から同じ画面へ戻る遷移は名札（jump）になる', () => {
  it('3 画面以上から STEP1 へ戻ると jump になり、2 画面までは back のまま', () => {
    const f = flowWith(5);
    let m = f.manual;
    const [s1, s2, s3, s4, s5] = f.screens;
    m = link(m, f.topicId, s1, s2);
    m = link(m, f.topicId, s2, s3);
    m = link(m, f.topicId, s3, s4);
    m = link(m, f.topicId, s4, s5);
    for (const s of [s2, s3, s4, s5]) m = link(m, f.topicId, s, s1, 'とりけし');
    m = link(m, f.topicId, s3, s2, 'もどる');
    const map = buildFlowMap(m, topicOf(m, f.topicId));
    const toS1 = map.edges.filter((e) => e.to === s1);
    expect(toS1).toHaveLength(4);
    expect(toS1.every((e) => e.kind === 'jump' && e.jumpTo === 'STEP1')).toBe(true);
    expect(map.edges.find((e) => e.from === s3 && e.to === s2)?.kind).toBe('back');
  });
});
