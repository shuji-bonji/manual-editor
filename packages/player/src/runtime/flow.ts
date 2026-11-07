/**
 * 画面遷移（kind: screenFlow）の runtime。P-1 の状態を持つ。
 *
 * - 開始画面から、ホットスポットを押して Hotspot.transition.to の画面へ進む。別の Topic の画面へも進める。
 * - 履歴（trail）は通った画面の id の列。back で 1 つ戻り、restart で開始画面に戻る。
 * - 行き先が Step.id（手順）のときは画面を変えず、press の結果で行き先を返す（表示側が P-2 を開く）。
 * - 適用範囲の選択は、押せるホットスポットには影響しない（Hotspot に scopeRefs は無い）。
 *   Transition.when が付いていて、選んだ値が合わないときは進まず notApplicable を返す。
 *
 * Manual は読むだけで書き換えない。
 */
import type { Hotspot, Manual, Screen, Topic } from '@shuji-bonji/experiential-manual-model';
import { findScreen, findTopic, resolveTarget, startScreenOf, type ScreenHit, type StepHit, type Target } from './lookup.js';
import type { ScopeSelection } from './scope.js';
import { createStore, type Readable } from './store.js';

/** 右の欄の「押せる場所」1 行 */
export interface Pressable {
  hotspot: Hotspot;
  /** 行き先。transition が無い・見つからないときは undefined */
  target?: Target;
  condition?: string;
}

export interface FlowState {
  /** 最初に開いた Topic */
  startTopic: Topic;
  /** 今の画面が属する Topic */
  topic: Topic;
  /** 今の画面。履歴の先頭の画面が Manual から消えていたときは undefined */
  screen: Screen | undefined;
  /** 通った画面の id（開始画面を含む。末尾が今の画面） */
  trail: string[];
  /** trail.length - 1 */
  position: number;
  canBack: boolean;
  /** 今の画面のホットスポット（画面の順） */
  pressable: Pressable[];
  scope: ScopeSelection;
}

export type PressResult =
  | { type: 'moved'; from: Screen; to: ScreenHit; condition?: string; label?: string }
  | { type: 'step'; hotspot: Hotspot; target: StepHit; condition?: string }
  | { type: 'read'; hotspot: Hotspot }
  | { type: 'noTransition'; hotspot: Hotspot }
  | { type: 'notFound'; hotspot: Hotspot; to: string }
  | { type: 'notApplicable'; hotspot: Hotspot; condition?: string }
  | { type: 'unknownHotspot'; id: string };

export interface FlowOptions {
  /** 最初に開く画面の id。省くと Topic の startScreenRef、無ければ先頭の画面 */
  startScreen?: string;
  scope?: ScopeSelection;
}

export interface Flow extends Readable<FlowState> {
  press(hotspotId: string): PressResult;
  back(): void;
  restart(): void;
  /** 履歴に積んで指定の画面へ移る（手順の図から画面を開くときなど） */
  goTo(screenId: string): boolean;
  setScope(selection: ScopeSelection): void;
}

/** 画面遷移の Topic を開く。Topic が無い、または画面が 1 つも無いときは undefined */
export function createFlow(manual: Manual, topicId: string, options: FlowOptions = {}): Flow | undefined {
  const foundTopic = findTopic(manual, topicId);
  if (!foundTopic) return undefined;
  const foundStart = options.startScreen ? findScreen(manual, options.startScreen)?.screen : startScreenOf(foundTopic);
  if (!foundStart) return undefined;
  // 下の関数宣言（compute）の中では絞り込みが効かないので、型を確定した別名を使う
  const startTopic: Topic = foundTopic;
  const start: Screen = foundStart;

  let trail: string[] = [start.id];
  let scope: ScopeSelection = options.scope ?? {};

  function compute(): FlowState {
    const currentId = trail[trail.length - 1] ?? start.id;
    const hit = findScreen(manual, currentId);
    const screen = hit?.screen;
    const topic = hit?.topic ?? startTopic;
    const pressable: Pressable[] = (screen?.hotspots ?? []).map((hotspot) => {
      const t = hotspot.transition;
      const target = t ? resolveTarget(manual, t.to) : undefined;
      const row: Pressable = { hotspot };
      if (target) row.target = target;
      if (t?.condition !== undefined) row.condition = t.condition;
      return row;
    });
    return {
      startTopic,
      topic,
      screen,
      trail: [...trail],
      position: trail.length - 1,
      canBack: trail.length > 1,
      pressable,
      scope
    };
  }

  const store = createStore<FlowState>(compute());
  const refresh = () => store.set(compute());

  return {
    subscribe: store.subscribe,
    get: store.get,
    press(hotspotId) {
      const state = store.get();
      const screen = state.screen;
      const hotspot = screen?.hotspots.find((h) => h.id === hotspotId);
      if (!screen || !hotspot) return { type: 'unknownHotspot', id: hotspotId };
      if (hotspot.action === 'read') return { type: 'read', hotspot };
      const t = hotspot.transition;
      if (!t) return { type: 'noTransition', hotspot };
      if (t.when) {
        const chosen = scope[t.when.property];
        if (chosen !== undefined && !t.when.values.includes(chosen)) {
          return t.condition !== undefined
            ? { type: 'notApplicable', hotspot, condition: t.condition }
            : { type: 'notApplicable', hotspot };
        }
      }
      const target = resolveTarget(manual, t.to);
      if (!target) return { type: 'notFound', hotspot, to: t.to };
      if (target.kind === 'step') {
        const { kind: _kind, ...hit } = target;
        return t.condition !== undefined
          ? { type: 'step', hotspot, target: hit, condition: t.condition }
          : { type: 'step', hotspot, target: hit };
      }
      trail = [...trail, target.screen.id];
      refresh();
      const { kind: _k, ...to } = target;
      const result: PressResult = { type: 'moved', from: screen, to };
      if (t.condition !== undefined) result.condition = t.condition;
      if (t.label !== undefined) result.label = t.label;
      return result;
    },
    back() {
      if (trail.length <= 1) return;
      trail = trail.slice(0, -1);
      refresh();
    },
    restart() {
      trail = [start.id];
      refresh();
    },
    goTo(screenId) {
      if (!findScreen(manual, screenId)) return false;
      trail = [...trail, screenId];
      refresh();
      return true;
    },
    setScope(selection) {
      scope = selection;
      refresh();
    }
  };
}
