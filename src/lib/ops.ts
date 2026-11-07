/**
 * Manual を編集する純粋な関数。
 *
 * - どの関数も、引数の Manual を書き換えずに、新しい Manual を返す（structuredClone した複製を直す）。
 * - id を作る関数は `{ manual, id }` を返す。id は `prefix-N`（N は未使用の最小の番号）で、同じ入力なら同じ結果になる。
 * - 対象が見つからないときは OpError を投げる。
 * - Topic・画面・Scope・素材を消したあとの参照切れは、ここでは直さない（validateManual が検出する）。
 *   直すための関数（dropBrokenTransitions など）は別に用意してあり、利用者が押したときだけ呼ぶ。
 */
import type {
  Admonition,
  AdmonitionLevel,
  Asset,
  Block,
  Hotspot,
  HotspotAction,
  HotspotShape,
  Manual,
  Scope,
  Screen,
  Step,
  Topic,
  TopicKind
} from '@shuji-bonji/experiential-manual-model';

export class OpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OpError';
  }
}

export interface Added {
  manual: Manual;
  id: string;
}

// ---------------------------------------------------------------------------
// 共通の補助
// ---------------------------------------------------------------------------

const clone = (m: Manual): Manual => structuredClone(m);

/** Manual の中にある id（Scope・素材・Topic・手順・画面・ホットスポット・Block）をすべて集める */
export function collectIds(m: Manual): Set<string> {
  const ids = new Set<string>();
  const steps = (list?: Step[]) =>
    list?.forEach((s) => {
      ids.add(s.id);
      steps(s.children);
    });
  const blocks = (list?: Block[]) =>
    list?.forEach((b) => {
      if (b.id) ids.add(b.id);
      blocks(b.children);
    });
  m.scopes?.forEach((s) => ids.add(s.id));
  m.assets?.forEach((a) => ids.add(a.id));
  for (const t of m.topics) {
    ids.add(t.id);
    steps(t.steps);
    blocks(t.blocks);
    t.screens?.forEach((sc) => {
      ids.add(sc.id);
      sc.hotspots?.forEach((h) => ids.add(h.id));
    });
  }
  return ids;
}

/** `prefix-N` の形で、まだ使われていない最小の id を返す */
export function nextId(m: Manual, prefix: string): string {
  const ids = collectIds(m);
  let n = 1;
  while (ids.has(`${prefix}-${n}`)) n++;
  return `${prefix}-${n}`;
}

/** 空文字・undefined の項目は削除し、それ以外は代入する（JSON に空の項目を残さないため） */
function assign<T extends object>(target: T, patch: Partial<Record<keyof T, unknown>>): void {
  const t = target as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === '') delete t[k];
    else t[k] = v;
  }
}

function moveInArray<T>(arr: T[], index: number, delta: number): void {
  const to = index + delta;
  if (index < 0 || to < 0 || to >= arr.length) return;
  const [item] = arr.splice(index, 1);
  arr.splice(to, 0, item);
}

function topicOf(d: Manual, topicId: string): Topic {
  const t = d.topics.find((x) => x.id === topicId);
  if (!t) throw new OpError(`Topic "${topicId}" が見つかりません`);
  return t;
}

function screenOf(d: Manual, topicId: string, screenId: string): Screen {
  const s = topicOf(d, topicId).screens?.find((x) => x.id === screenId);
  if (!s) throw new OpError(`画面 "${screenId}" が見つかりません`);
  return s;
}

function hotspotOf(d: Manual, topicId: string, screenId: string, hotspotId: string): Hotspot {
  const h = screenOf(d, topicId, screenId).hotspots.find((x) => x.id === hotspotId);
  if (!h) throw new OpError(`ホットスポット "${hotspotId}" が見つかりません`);
  return h;
}

interface StepLocation {
  list: Step[];
  index: number;
  step: Step;
  /** 親の手順（最上位なら undefined） */
  parent?: Step;
  parentList?: Step[];
}

function locateStep(
  list: Step[] | undefined,
  id: string,
  parent?: Step,
  parentList?: Step[]
): StepLocation | undefined {
  if (!list) return undefined;
  for (let i = 0; i < list.length; i++) {
    if (list[i].id === id) return { list, index: i, step: list[i], parent, parentList };
    const found = locateStep(list[i].children, id, list[i], list);
    if (found) return found;
  }
  return undefined;
}

function stepOf(d: Manual, topicId: string, stepId: string): StepLocation {
  const loc = locateStep(topicOf(d, topicId).steps, stepId);
  if (!loc) throw new OpError(`手順 "${stepId}" が見つかりません`);
  return loc;
}

// ---------------------------------------------------------------------------
// Manual
// ---------------------------------------------------------------------------

export function newManual(id: string, title: string, language = 'ja'): Manual {
  return { id, title, version: { number: '1.0' }, language, topics: [] };
}

export function updateManual(
  m: Manual,
  patch: { title?: string; language?: string; description?: string; versionNumber?: string; versionDate?: string }
): Manual {
  const d = clone(m);
  if (patch.title !== undefined) d.title = patch.title;
  if (patch.language !== undefined) d.language = patch.language;
  if (patch.description !== undefined) assign(d, { description: patch.description });
  if (patch.versionNumber !== undefined) d.version.number = patch.versionNumber;
  if (patch.versionDate !== undefined) assign(d.version, { date: patch.versionDate });
  return d;
}

// ---------------------------------------------------------------------------
// Topic
// ---------------------------------------------------------------------------

/** kind に合わせて、主に使う配列を空で用意する */
function ensureBody(t: Topic): void {
  if (t.kind === 'screenFlow') t.screens ??= [];
  else if (t.kind === 'procedure' || t.kind === 'troubleshooting') t.steps ??= [];
  else t.blocks ??= [];
}

export function addTopic(m: Manual, kind: TopicKind, title: string): Added {
  const id = nextId(m, 'topic');
  const d = clone(m);
  const topic: Topic = { id, kind, title };
  ensureBody(topic);
  d.topics.push(topic);
  return { manual: d, id };
}

export function updateTopic(
  m: Manual,
  topicId: string,
  patch: { title?: string; summary?: string; kind?: TopicKind }
): Manual {
  const d = clone(m);
  const t = topicOf(d, topicId);
  if (patch.title !== undefined) t.title = patch.title;
  if (patch.summary !== undefined) assign(t, { summary: patch.summary });
  if (patch.kind !== undefined) {
    t.kind = patch.kind;
    ensureBody(t);
  }
  return d;
}

export function moveTopic(m: Manual, topicId: string, delta: number): Manual {
  const d = clone(m);
  topicOf(d, topicId);
  moveInArray(
    d.topics,
    d.topics.findIndex((t) => t.id === topicId),
    delta
  );
  return d;
}

export function removeTopic(m: Manual, topicId: string): Manual {
  const d = clone(m);
  topicOf(d, topicId);
  d.topics = d.topics.filter((t) => t.id !== topicId);
  return d;
}

// ---------------------------------------------------------------------------
// 素材
// ---------------------------------------------------------------------------

/** 同じ path が既にあれば `name-2.png` のように番号を足して、素材の path を一意にする */
export function uniquePath(m: Manual, filename: string): string {
  const used = new Set((m.assets ?? []).map((a) => a.source.path));
  if (!used.has(filename)) return filename;
  const dot = filename.lastIndexOf('.');
  const stem = dot > 0 ? filename.slice(0, dot) : filename;
  const ext = dot > 0 ? filename.slice(dot) : '';
  let n = 2;
  while (used.has(`${stem}-${n}${ext}`)) n++;
  return `${stem}-${n}${ext}`;
}

export function addAsset(
  m: Manual,
  input: { filename: string; mediaType?: string; alt?: string; hash?: string }
): Added {
  const id = nextId(m, 'asset');
  const d = clone(m);
  const asset: Asset = { id, kind: 'image', source: { path: uniquePath(m, input.filename) } };
  assign(asset.source, { mediaType: input.mediaType, hash: input.hash });
  assign(asset, { alt: input.alt });
  (d.assets ??= []).push(asset);
  return { manual: d, id };
}

export function updateAsset(m: Manual, assetId: string, patch: { alt?: string; credit?: string }): Manual {
  const d = clone(m);
  const a = d.assets?.find((x) => x.id === assetId);
  if (!a) throw new OpError(`素材 "${assetId}" が見つかりません`);
  assign(a, patch);
  return d;
}

/** Manual の中で参照されている素材の id（画面の assetRef、Block の assetRef、手順の assetRefs） */
export function usedAssetIds(m: Manual): Set<string> {
  const used = new Set<string>();
  const blocks = (list?: Block[]) =>
    list?.forEach((b) => {
      if (b.assetRef) used.add(b.assetRef);
      blocks(b.children);
    });
  const steps = (list?: Step[]) =>
    list?.forEach((s) => {
      s.assetRefs?.forEach((r) => used.add(r));
      steps(s.children);
    });
  for (const t of m.topics) {
    blocks(t.blocks);
    steps(t.steps);
    t.screens?.forEach((s) => used.add(s.assetRef));
  }
  return used;
}

/** どこからも参照されていない素材を取り除く */
export function removeUnusedAssets(m: Manual): Manual {
  const d = clone(m);
  const used = usedAssetIds(d);
  if (d.assets) {
    d.assets = d.assets.filter((a) => used.has(a.id));
    if (d.assets.length === 0) delete d.assets;
  }
  return d;
}

// ---------------------------------------------------------------------------
// 画面
// ---------------------------------------------------------------------------

export function addScreen(m: Manual, topicId: string, assetId: string, caption?: string): Added {
  if (!m.assets?.some((a) => a.id === assetId)) throw new OpError(`素材 "${assetId}" が見つかりません`);
  const id = nextId(m, 'screen');
  const d = clone(m);
  const t = topicOf(d, topicId);
  const screen: Screen = { id, assetRef: assetId, hotspots: [] };
  assign(screen, { caption });
  (t.screens ??= []).push(screen);
  // 最初の 1 枚を、体験表示の開始画面にする
  if (!t.startScreenRef) t.startScreenRef = id;
  return { manual: d, id };
}

export function updateScreen(
  m: Manual,
  topicId: string,
  screenId: string,
  patch: { caption?: string; description?: string; assetRef?: string }
): Manual {
  const d = clone(m);
  const s = screenOf(d, topicId, screenId);
  if (patch.assetRef !== undefined) {
    if (!d.assets?.some((a) => a.id === patch.assetRef)) throw new OpError(`素材 "${patch.assetRef}" が見つかりません`);
    s.assetRef = patch.assetRef;
  }
  for (const k of ['caption', 'description'] as const) if (k in patch) assign(s, { [k]: patch[k] });
  return d;
}

export function setStartScreen(m: Manual, topicId: string, screenId: string): Manual {
  const d = clone(m);
  screenOf(d, topicId, screenId);
  topicOf(d, topicId).startScreenRef = screenId;
  return d;
}

export function moveScreen(m: Manual, topicId: string, screenId: string, delta: number): Manual {
  const d = clone(m);
  const t = topicOf(d, topicId);
  screenOf(d, topicId, screenId);
  moveInArray(
    t.screens!,
    t.screens!.findIndex((s) => s.id === screenId),
    delta
  );
  return d;
}

/**
 * 画面を消す。開始画面だった場合は、残った最初の画面を開始画面にする（無ければ startScreenRef を消す）。
 * この画面を指す transition.to は残る（validateManual が検出する）。
 */
export function removeScreen(m: Manual, topicId: string, screenId: string): Manual {
  const d = clone(m);
  const t = topicOf(d, topicId);
  screenOf(d, topicId, screenId);
  t.screens = t.screens!.filter((s) => s.id !== screenId);
  if (t.startScreenRef === screenId) {
    if (t.screens.length > 0) t.startScreenRef = t.screens[0].id;
    else delete t.startScreenRef;
  }
  return d;
}

// ---------------------------------------------------------------------------
// ホットスポット
// ---------------------------------------------------------------------------

/**
 * coords を manual-model の規則に合わせて整える。
 * - 値は整数に丸める（画像の元の大きさの画素）
 * - rect は [x1, y1, x2, y2] で x1<x2・y1<y2 に並べ替える
 * - circle は [cx, cy, r]
 * - 大きさが 0 のもの、個数が合わないものは OpError
 * - poly は点の並びをそのまま使う（試作では描画しない。JSON から読んだものを保つ用）
 */
export function normalizeCoords(shape: HotspotShape, coords: number[]): number[] {
  if (!coords.every((n) => Number.isFinite(n))) throw new OpError('座標に数値でない値があります');
  const c = coords.map((n) => Math.round(n));
  if (shape === 'rect') {
    if (c.length !== 4) throw new OpError('矩形の座標は 4 つの数（x1, y1, x2, y2）です');
    const [x1, y1, x2, y2] = [Math.min(c[0], c[2]), Math.min(c[1], c[3]), Math.max(c[0], c[2]), Math.max(c[1], c[3])];
    if (x1 === x2 || y1 === y2) throw new OpError('矩形の幅と高さは 1 以上にしてください');
    return [x1, y1, x2, y2];
  }
  if (shape === 'circle') {
    if (c.length !== 3) throw new OpError('円の座標は 3 つの数（cx, cy, r）です');
    if (c[2] < 1) throw new OpError('円の半径は 1 以上にしてください');
    return c;
  }
  if (c.length < 6 || c.length % 2 !== 0) throw new OpError('多角形の座標は 6 個以上の偶数個の数です');
  return c;
}

export function addHotspot(
  m: Manual,
  topicId: string,
  screenId: string,
  input: { shape: HotspotShape; coords: number[]; label?: string; action?: HotspotAction }
): Added {
  const coords = normalizeCoords(input.shape, input.coords);
  const id = nextId(m, 'hotspot');
  const d = clone(m);
  const s = screenOf(d, topicId, screenId);
  const h: Hotspot = { id, shape: input.shape, coords, action: input.action ?? 'press' };
  assign(h, { label: input.label });
  s.hotspots.push(h);
  return { manual: d, id };
}

export function updateHotspot(
  m: Manual,
  topicId: string,
  screenId: string,
  hotspotId: string,
  patch: { label?: string; action?: HotspotAction | ''; coords?: number[] }
): Manual {
  const d = clone(m);
  const h = hotspotOf(d, topicId, screenId, hotspotId);
  if (patch.coords !== undefined) h.coords = normalizeCoords(h.shape, patch.coords);
  if ('label' in patch) assign(h, { label: patch.label });
  if ('action' in patch) assign(h, { action: patch.action });
  return d;
}

export function removeHotspot(m: Manual, topicId: string, screenId: string, hotspotId: string): Manual {
  const d = clone(m);
  const s = screenOf(d, topicId, screenId);
  hotspotOf(d, topicId, screenId, hotspotId);
  s.hotspots = s.hotspots.filter((h) => h.id !== hotspotId);
  return d;
}

/** 遷移先（Screen.id または Step.id）を付ける。to が null なら遷移を外す */
export function setTransition(
  m: Manual,
  topicId: string,
  screenId: string,
  hotspotId: string,
  to: string | null,
  extra: { label?: string; condition?: string } = {}
): Manual {
  const d = clone(m);
  const h = hotspotOf(d, topicId, screenId, hotspotId);
  if (to === null || to === '') {
    delete h.transition;
    return d;
  }
  h.transition = { to };
  assign(h.transition, extra);
  return d;
}

/** 遷移先が画面にも手順にも無い transition を、すべてのホットスポットから外す。外した件数を返す */
export function dropBrokenTransitions(m: Manual): { manual: Manual; dropped: number } {
  const d = clone(m);
  const known = collectIds(d);
  let dropped = 0;
  for (const t of d.topics)
    for (const s of t.screens ?? [])
      for (const h of s.hotspots)
        if (h.transition && !known.has(h.transition.to)) {
          delete h.transition;
          dropped++;
        }
  return { manual: d, dropped };
}

// ---------------------------------------------------------------------------
// 手順
// ---------------------------------------------------------------------------

/** parentStepId を指定すると、その手順の子として追加する（入れ子） */
export function addStep(m: Manual, topicId: string, text: string, parentStepId?: string): Added {
  const id = nextId(m, 'step');
  const d = clone(m);
  const t = topicOf(d, topicId);
  const step: Step = { id, text };
  if (parentStepId) {
    const loc = stepOf(d, topicId, parentStepId);
    (loc.step.children ??= []).push(step);
  } else {
    (t.steps ??= []).push(step);
  }
  return { manual: d, id };
}

export function updateStep(
  m: Manual,
  topicId: string,
  stepId: string,
  patch: { text?: string; expected?: string; question?: string; targetRef?: string }
): Manual {
  const d = clone(m);
  const { step } = stepOf(d, topicId, stepId);
  if (patch.text !== undefined) step.text = patch.text;
  for (const k of ['expected', 'question', 'targetRef'] as const)
    if (k in patch) assign(step, { [k]: patch[k] });
  return d;
}

export function removeStep(m: Manual, topicId: string, stepId: string): Manual {
  const d = clone(m);
  const loc = stepOf(d, topicId, stepId);
  loc.list.splice(loc.index, 1);
  if (loc.parent && loc.parent.children?.length === 0) delete loc.parent.children;
  return d;
}

/** 同じ階層の中で上（delta=-1）・下（delta=1）へ動かす */
export function moveStep(m: Manual, topicId: string, stepId: string, delta: number): Manual {
  const d = clone(m);
  const loc = stepOf(d, topicId, stepId);
  moveInArray(loc.list, loc.index, delta);
  return d;
}

/** 直前の兄弟の子にする（一段深くする）。直前の兄弟が無ければ何もしない */
export function indentStep(m: Manual, topicId: string, stepId: string): Manual {
  const d = clone(m);
  const loc = stepOf(d, topicId, stepId);
  if (loc.index === 0) return d;
  const prev = loc.list[loc.index - 1];
  loc.list.splice(loc.index, 1);
  (prev.children ??= []).push(loc.step);
  return d;
}

/** 親の直後の兄弟にする（一段浅くする）。最上位なら何もしない */
export function outdentStep(m: Manual, topicId: string, stepId: string): Manual {
  const d = clone(m);
  const loc = stepOf(d, topicId, stepId);
  if (!loc.parent || !loc.parentList) return d;
  loc.list.splice(loc.index, 1);
  if (loc.list.length === 0) delete loc.parent.children;
  const at = loc.parentList.indexOf(loc.parent);
  loc.parentList.splice(at + 1, 0, loc.step);
  return d;
}

// ---------------------------------------------------------------------------
// 注意書き（手順または画面に付く）
// ---------------------------------------------------------------------------

export type AdmonitionOwner =
  | { kind: 'step'; topicId: string; stepId: string }
  | { kind: 'screen'; topicId: string; screenId: string };

function ownerOf(d: Manual, o: AdmonitionOwner): Step | Screen {
  return o.kind === 'step' ? stepOf(d, o.topicId, o.stepId).step : screenOf(d, o.topicId, o.screenId);
}

export function addAdmonition(m: Manual, owner: AdmonitionOwner, level: AdmonitionLevel, text: string): Manual {
  const d = clone(m);
  const target = ownerOf(d, owner);
  (target.admonitions ??= []).push({ level, text });
  return d;
}

export function updateAdmonition(
  m: Manual,
  owner: AdmonitionOwner,
  index: number,
  patch: Partial<Admonition>
): Manual {
  const d = clone(m);
  const a = ownerOf(d, owner).admonitions?.[index];
  if (!a) throw new OpError('注意書きが見つかりません');
  if (patch.level !== undefined) a.level = patch.level;
  if (patch.text !== undefined) a.text = patch.text;
  return d;
}

export function removeAdmonition(m: Manual, owner: AdmonitionOwner, index: number): Manual {
  const d = clone(m);
  const target = ownerOf(d, owner);
  if (!target.admonitions?.[index]) throw new OpError('注意書きが見つかりません');
  target.admonitions.splice(index, 1);
  if (target.admonitions.length === 0) delete target.admonitions;
  return d;
}

// ---------------------------------------------------------------------------
// 適用範囲（Scope）と scopeRefs
// ---------------------------------------------------------------------------

export function addScope(m: Manual, input: { property: string; values: string[]; displayText: string }): Added {
  const id = nextId(m, 'scope');
  const d = clone(m);
  const scope: Scope = { id, property: input.property, values: input.values, displayText: input.displayText };
  (d.scopes ??= []).push(scope);
  return { manual: d, id };
}

export function updateScope(
  m: Manual,
  scopeId: string,
  patch: { property?: string; values?: string[]; displayText?: string }
): Manual {
  const d = clone(m);
  const s = d.scopes?.find((x) => x.id === scopeId);
  if (!s) throw new OpError(`適用範囲 "${scopeId}" が見つかりません`);
  if (patch.property !== undefined) s.property = patch.property;
  if (patch.values !== undefined) s.values = patch.values;
  if (patch.displayText !== undefined) s.displayText = patch.displayText;
  return d;
}

/** 適用範囲を消す。Topic・手順・画面・Block の scopeRefs からも外す（残すと validateManual のエラーになるため） */
export function removeScope(m: Manual, scopeId: string): Manual {
  const d = clone(m);
  if (!d.scopes?.some((s) => s.id === scopeId)) throw new OpError(`適用範囲 "${scopeId}" が見つかりません`);
  d.scopes = d.scopes.filter((s) => s.id !== scopeId);
  if (d.scopes.length === 0) delete d.scopes;
  const strip = (o: { scopeRefs?: string[] }) => {
    if (!o.scopeRefs) return;
    o.scopeRefs = o.scopeRefs.filter((r) => r !== scopeId);
    if (o.scopeRefs.length === 0) delete o.scopeRefs;
  };
  const steps = (list?: Step[]) =>
    list?.forEach((s) => {
      strip(s);
      steps(s.children);
    });
  const blocks = (list?: Block[]) =>
    list?.forEach((b) => {
      strip(b);
      blocks(b.children);
    });
  for (const t of d.topics) {
    strip(t);
    steps(t.steps);
    blocks(t.blocks);
    t.screens?.forEach(strip);
  }
  return d;
}

export type ScopeTarget =
  | { kind: 'topic'; topicId: string }
  | { kind: 'step'; topicId: string; stepId: string }
  | { kind: 'screen'; topicId: string; screenId: string };

function scopeHolder(d: Manual, t: ScopeTarget): { scopeRefs?: string[] } {
  if (t.kind === 'topic') return topicOf(d, t.topicId);
  if (t.kind === 'step') return stepOf(d, t.topicId, t.stepId).step;
  return screenOf(d, t.topicId, t.screenId);
}

export function getScopeRefs(m: Manual, target: ScopeTarget): string[] {
  return [...(scopeHolder(m, target).scopeRefs ?? [])];
}

/** scopeRefs に適用範囲を付ける（on=true）・外す（on=false） */
export function setScopeRef(m: Manual, target: ScopeTarget, scopeId: string, on: boolean): Manual {
  if (!m.scopes?.some((s) => s.id === scopeId)) throw new OpError(`適用範囲 "${scopeId}" が見つかりません`);
  const d = clone(m);
  const holder = scopeHolder(d, target);
  const refs = new Set(holder.scopeRefs ?? []);
  if (on) refs.add(scopeId);
  else refs.delete(scopeId);
  if (refs.size === 0) delete holder.scopeRefs;
  else holder.scopeRefs = [...refs];
  return d;
}

// ---------------------------------------------------------------------------
// 検索の補助（画面側が使う読み取り専用の関数）
// ---------------------------------------------------------------------------

/** 画面 id から、その画面と属する Topic を探す（Topic をまたぐ遷移の追跡に使う） */
export function findScreen(m: Manual, screenId: string): { topic: Topic; screen: Screen } | undefined {
  for (const topic of m.topics) {
    const screen = topic.screens?.find((s) => s.id === screenId);
    if (screen) return { topic, screen };
  }
  return undefined;
}

/** 手順を平らにして、深さつきで返す（一覧表示用） */
export function flattenSteps(steps: Step[] | undefined, depth = 0): Array<{ step: Step; depth: number }> {
  const out: Array<{ step: Step; depth: number }> = [];
  for (const s of steps ?? []) {
    out.push({ step: s, depth });
    out.push(...flattenSteps(s.children, depth + 1));
  }
  return out;
}
