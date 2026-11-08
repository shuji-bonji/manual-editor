/**
 * E-5 遷移の地図の配置計算。
 *
 * 1 つの Topic（screenFlow）の画面をノード、Hotspot.transition を辺にして、左から右へ流れる階層配置を求める。
 * Svelte に依存しない純粋な関数で、FlowMap.svelte はここで求めた座標をそのまま SVG に描く。
 *
 * - 階層（layer）は開始画面からの幅優先探索の深さ。開始画面から到達できない画面は、到達できる画面の右側に
 *   まとめて置き、`unreachable` を立てる（validateManual の警告「cannot be reached」と同じ判定）。
 * - 遷移先が他の Topic の画面・手順のときは `external` のノード、どこにも無いときは `missing` のノードを
 *   遷移元の 1 つ右に置く。遷移先の無いホットスポット（action が read 以外）は画面ごとに数える（`dangling`）。
 * - 同じ階層の中の並びは、1 つ左の階層にある遷移元の行の平均（barycenter）で揃えて、辺の交差を減らす。
 * - 位置は保存しない（設計書 E-5）。同じ Manual からは同じ配置が出る。
 */
import type { Manual, Screen, Topic } from '@shuji-bonji/experiential-manual-model';

export type MapNodeKind = 'screen' | 'external' | 'missing';

export interface MapNode {
  /** screen の id、または `ext:<遷移先 id>` / `missing:<遷移先 id>` */
  id: string;
  kind: MapNodeKind;
  /** 画面の caption（無ければ id）。external は遷移先の画面の caption か手順の文 */
  label: string;
  /** external のときの Topic の題名 */
  sub?: string;
  layer: number;
  row: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** 開始画面 */
  start: boolean;
  /** 開始画面から到達できない画面 */
  unreachable: boolean;
  /** ホットスポットの数（screen のみ） */
  hotspots: number;
  /** 遷移の付いていないホットスポット（action が read のものは数えない） */
  dangling: number;
  /** 遷移先が見つからないホットスポット */
  broken: number;
  /** 押したときに選ぶ場所 */
  target?: { topicId: string; screenId?: string; stepId?: string };
}

/**
 * forward = 右へ進む、same = 同じ階層、back = 左へ戻る（点線の弧）、self = 同じ画面、
 * jump = 多くの画面から同じ画面へ戻る遷移（「とりけし → STEP1」のような）。線を引かず、遷移元の下に行き先の名札だけを出す
 */
export type MapEdgeKind = 'forward' | 'same' | 'back' | 'self' | 'jump';

export interface MapEdge {
  id: string;
  from: string;
  to: string;
  /** 辺にまとめたホットスポットのラベル（遷移の見出しがあればそれ） */
  labels: string[];
  /** まとめたホットスポットの数 */
  count: number;
  kind: MapEdgeKind;
  /** 遷移先が無い（missing ノードへの辺） */
  broken: boolean;
  /** 他の Topic への辺 */
  external: boolean;
  /** SVG の path の d */
  d: string;
  /** ラベルを置く位置 */
  lx: number;
  ly: number;
  /** jump のときの行き先の名前 */
  jumpTo?: string;
}

export interface FlowMap {
  topicId: string;
  nodes: MapNode[];
  edges: MapEdge[];
  width: number;
  height: number;
  /** 集計 */
  unreachable: number;
  dangling: number;
  broken: number;
}

export interface LayoutOptions {
  nodeWidth: number;
  nodeHeight: number;
  gapX: number;
  gapY: number;
  pad: number;
}

export const DEFAULT_LAYOUT: LayoutOptions = { nodeWidth: 168, nodeHeight: 48, gapX: 80, gapY: 34, pad: 32 };

/** 同じ画面へ戻る遷移がこの数以上あれば、線を引かずに名札（jump）にする */
export const JUMP_THRESHOLD = 3;

interface RawEdge {
  from: string;
  to: string;
  labels: string[];
  count: number;
  broken: boolean;
  external: boolean;
}

/** 遷移先 id が、この Topic 以外のどこを指すかを調べる */
function resolveOutside(manual: Manual, topic: Topic, to: string): { label: string; sub: string; target: MapNode['target'] } | undefined {
  for (const t of manual.topics) {
    if (t.id === topic.id) continue;
    const screen = t.screens?.find((s) => s.id === to);
    if (screen) return { label: screen.caption || screen.id, sub: t.title, target: { topicId: t.id, screenId: screen.id } };
    const step = findStep(t.steps, to);
    if (step) return { label: step.text || step.id, sub: t.title, target: { topicId: t.id, stepId: step.id } };
  }
  return undefined;
}

function findStep(list: Topic['steps'], id: string): { id: string; text: string } | undefined {
  for (const s of list ?? []) {
    if (s.id === id) return s;
    const c = findStep(s.children, id);
    if (c) return c;
  }
  return undefined;
}

export function buildFlowMap(manual: Manual, topic: Topic, options: Partial<LayoutOptions> = {}): FlowMap {
  const o = { ...DEFAULT_LAYOUT, ...options };
  const screens: Screen[] = topic.screens ?? [];
  const byId = new Map(screens.map((s) => [s.id, s]));
  const startId = topic.startScreenRef && byId.has(topic.startScreenRef) ? topic.startScreenRef : screens[0]?.id;

  // ---- ノードと辺を集める ----------------------------------------------------
  const nodes = new Map<string, MapNode>();
  const rawEdges = new Map<string, RawEdge>();
  const base = (id: string, kind: MapNodeKind, label: string): MapNode => ({
    id,
    kind,
    label,
    layer: 0,
    row: 0,
    x: 0,
    y: 0,
    w: o.nodeWidth,
    h: o.nodeHeight,
    start: false,
    unreachable: false,
    hotspots: 0,
    dangling: 0,
    broken: 0
  });

  for (const s of screens) {
    const n = base(s.id, 'screen', s.caption || s.id);
    n.start = s.id === startId;
    n.hotspots = s.hotspots.length;
    n.target = { topicId: topic.id, screenId: s.id };
    nodes.set(s.id, n);
  }

  for (const s of screens) {
    const from = nodes.get(s.id)!;
    for (const h of s.hotspots) {
      if (!h.transition) {
        if ((h.action ?? 'press') !== 'read') from.dangling++;
        continue;
      }
      const to = h.transition.to;
      let toId = to;
      let broken = false;
      let external = false;
      if (!byId.has(to)) {
        const outside = resolveOutside(manual, topic, to);
        if (outside) {
          external = true;
          toId = `ext:${to}`;
          if (!nodes.has(toId)) {
            const n = base(toId, 'external', outside.label);
            n.sub = outside.sub;
            n.target = outside.target;
            nodes.set(toId, n);
          }
        } else {
          broken = true;
          from.broken++;
          toId = `missing:${to}`;
          if (!nodes.has(toId)) nodes.set(toId, base(toId, 'missing', to));
        }
      }
      const key = `${s.id}\u0000${toId}`;
      const label = h.transition.label || h.label || h.id;
      const e = rawEdges.get(key);
      if (e) {
        e.count++;
        if (!e.labels.includes(label)) e.labels.push(label);
      } else rawEdges.set(key, { from: s.id, to: toId, labels: [label], count: 1, broken, external });
    }
  }

  // ---- 階層: 開始画面からの幅優先探索 -------------------------------------------
  const out = new Map<string, string[]>();
  for (const e of rawEdges.values()) {
    if (!byId.has(e.to)) continue; // 外部・不明は後で置く
    (out.get(e.from) ?? out.set(e.from, []).get(e.from)!).push(e.to);
  }
  const layer = new Map<string, number>();
  const bfs = (root: string, depth0: number) => {
    const queue = [root];
    layer.set(root, depth0);
    while (queue.length) {
      const cur = queue.shift()!;
      for (const next of out.get(cur) ?? []) {
        if (layer.has(next)) continue;
        layer.set(next, layer.get(cur)! + 1);
        queue.push(next);
      }
    }
  };
  if (startId) bfs(startId, 0);
  let maxLayer = Math.max(-1, ...layer.values());
  // 到達できない画面は、画面の並び順に、到達できる画面の右へ置いていく
  for (const s of screens) {
    if (layer.has(s.id)) continue;
    bfs(s.id, maxLayer + 1);
    maxLayer = Math.max(maxLayer, ...layer.values());
    // この探索で初めて置いた画面は、どれも開始画面から到達できない
  }
  for (const s of screens) {
    const n = nodes.get(s.id)!;
    n.layer = layer.get(s.id) ?? 0;
  }
  if (startId) {
    // 開始画面から届く画面を改めて数える（到達できない画面の探索で layer を得たものと区別する）
    const reach = new Set<string>();
    const queue = [startId];
    reach.add(startId);
    while (queue.length) {
      const cur = queue.shift()!;
      for (const next of out.get(cur) ?? []) {
        if (reach.has(next)) continue;
        reach.add(next);
        queue.push(next);
      }
    }
    for (const s of screens) nodes.get(s.id)!.unreachable = !reach.has(s.id);
  }
  // 外部・不明のノードは、遷移元の 1 つ右
  for (const n of nodes.values()) {
    if (n.kind === 'screen') continue;
    let l = 0;
    for (const e of rawEdges.values()) if (e.to === n.id) l = Math.max(l, (nodes.get(e.from)?.layer ?? 0) + 1);
    n.layer = l;
    maxLayer = Math.max(maxLayer, l);
  }

  // ---- 階層の中の並び（barycenter で 2 回揃える） ------------------------------------
  const layers: MapNode[][] = Array.from({ length: maxLayer + 1 }, () => []);
  for (const n of nodes.values()) layers[n.layer].push(n);
  // 初期順: 画面の並び順（external / missing は末尾）
  const order = new Map<string, number>();
  screens.forEach((s, i) => order.set(s.id, i));
  for (const l of layers) l.sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9));
  const preds = new Map<string, string[]>();
  for (const e of rawEdges.values()) (preds.get(e.to) ?? preds.set(e.to, []).get(e.to)!).push(e.from);
  for (let sweep = 0; sweep < 2; sweep++) {
    for (let li = 1; li < layers.length; li++) {
      const rowOf = new Map<string, number>();
      layers[li - 1].forEach((n, r) => rowOf.set(n.id, r));
      const score = new Map<string, number>();
      layers[li].forEach((n, r) => {
        const rows = (preds.get(n.id) ?? []).map((p) => rowOf.get(p)).filter((x): x is number => x !== undefined);
        score.set(n.id, rows.length ? rows.reduce((a, b) => a + b, 0) / rows.length : r);
      });
      layers[li].sort((a, b) => score.get(a.id)! - score.get(b.id)!);
    }
  }

  // ---- 座標 ------------------------------------------------------------------
  const maxRows = Math.max(1, ...layers.map((l) => l.length));
  const colH = maxRows * (o.nodeHeight + o.gapY) - o.gapY;
  layers.forEach((l, li) => {
    const offset = (colH - (l.length * (o.nodeHeight + o.gapY) - o.gapY)) / 2;
    l.forEach((n, r) => {
      n.row = r;
      n.x = o.pad + li * (o.nodeWidth + o.gapX);
      n.y = o.pad + offset + r * (o.nodeHeight + o.gapY);
    });
  });

  // ---- 辺の形 -------------------------------------------------------------------
  // 多くの画面から戻ってくる画面（ホーム・取り消し先）への戻りの辺は、線にすると扇形に重なって読めないので名札にする
  const backCount = new Map<string, number>();
  for (const e of rawEdges.values()) {
    const a = nodes.get(e.from)!;
    const b = nodes.get(e.to)!;
    if (a.id !== b.id && b.layer < a.layer) backCount.set(b.id, (backCount.get(b.id) ?? 0) + 1);
  }
  const edges: MapEdge[] = [];
  let backDepth = 0;
  let i = 0;
  const jumpSlot = new Map<string, number>();
  for (const e of rawEdges.values()) {
    const a = nodes.get(e.from)!;
    const b = nodes.get(e.to)!;
    let kind: MapEdgeKind;
    let d: string;
    let lx: number;
    let ly: number;
    let jumpTo: string | undefined;
    if (a.id !== b.id && b.layer < a.layer && (backCount.get(b.id) ?? 0) >= JUMP_THRESHOLD) {
      kind = 'jump';
      const slot = jumpSlot.get(a.id) ?? 0;
      jumpSlot.set(a.id, slot + 1);
      // ノードの上に置く（下は戻る遷移の弧が通る）
      const x = a.x + 10 + slot * 80;
      const y = a.y;
      d = `M ${x + 4} ${y} L ${x + 4} ${y - 7}`;
      lx = x;
      ly = y - 11;
      jumpTo = b.label;
    } else if (a.id === b.id) {
      kind = 'self';
      const x = a.x + a.w;
      const y = a.y + a.h * 0.25;
      d = `M ${x} ${y + 12} C ${x + 36} ${y + 24}, ${x + 36} ${y - 28}, ${x - 10} ${a.y}`;
      lx = x + 30;
      ly = y - 2;
    } else if (b.layer > a.layer) {
      kind = 'forward';
      const fx = a.x + a.w;
      const fy = a.y + a.h / 2;
      const tx = b.x;
      const ty = b.y + b.h / 2;
      const c = Math.min(o.gapX * 0.6, (tx - fx) / 2);
      d = `M ${fx} ${fy} C ${fx + c} ${fy}, ${tx - c} ${ty}, ${tx} ${ty}`;
      lx = (fx + tx) / 2;
      ly = (fy + ty) / 2 - 6;
    } else if (b.layer === a.layer) {
      kind = 'same';
      const x = a.x + a.w;
      const fy = a.y + a.h / 2 + 6;
      const ty = b.y + b.h / 2 - 6;
      const bulge = 28 + Math.abs(b.row - a.row) * 6;
      d = `M ${x} ${fy} C ${x + bulge} ${fy}, ${x + bulge} ${ty}, ${x} ${ty}`;
      lx = x + bulge * 0.8;
      ly = (fy + ty) / 2;
    } else {
      kind = 'back';
      backDepth = Math.max(backDepth, a.layer - b.layer);
      const fx = a.x + a.w / 2;
      const fy = a.y + a.h;
      const tx = b.x + b.w / 2;
      const ty = b.y + b.h;
      const dip = o.pad + colH + 24 + (a.layer - b.layer) * 14;
      d = `M ${fx} ${fy} C ${fx} ${dip}, ${tx} ${dip}, ${tx} ${ty + 2}`;
      lx = (fx + tx) / 2;
      ly = dip - 6;
    }
    const edge: MapEdge = { id: `e${i++}`, from: e.from, to: e.to, labels: e.labels, count: e.count, kind, broken: e.broken, external: e.external, d, lx, ly };
    if (jumpTo !== undefined) edge.jumpTo = jumpTo;
    edges.push(edge);
  }

  const nodeList = [...nodes.values()];
  const cols = Math.max(0, maxLayer) + 1;
  const width = o.pad * 2 + cols * o.nodeWidth + (cols - 1) * o.gapX + (edges.some((e) => e.kind === 'same' || e.kind === 'self') ? 48 : 0);
  const height = o.pad * 2 + colH + (backDepth > 0 ? 40 + backDepth * 14 : 0);

  return {
    topicId: topic.id,
    nodes: nodeList,
    edges,
    width,
    height,
    unreachable: nodeList.filter((n) => n.unreachable).length,
    dangling: nodeList.reduce((s, n) => s + n.dangling, 0),
    broken: nodeList.reduce((s, n) => s + n.broken, 0)
  };
}

/** SVG の text は折り返さないので、長いラベルは切って末尾に … を付ける */
export function ellipsize(text: string, max: number): string {
  const chars = [...text];
  return chars.length <= max ? text : chars.slice(0, Math.max(1, max - 1)).join('') + '…';
}
