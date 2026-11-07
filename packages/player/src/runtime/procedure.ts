/**
 * 手順（kind: procedure）の runtime。P-2 の一覧と「1 つずつ進める」モードの状態を持つ。
 *
 * - 手順の番号は model の numberSteps で表示時に組み立てる。適用範囲で消えた手順は番号を詰める。
 * - next: Step.next が無ければ次の行（番号順）。条件の無い next が 1 つだけならそこへ進む。
 *   条件付き、または複数のときは進まず、選択肢（branches）を返す。
 * - 行き先が別の Topic の手順や画面のときは、この runtime の中では動かず、結果で行き先を返す。
 */
import { numberSteps, type Manual, type NumberedStep, type Step, type Topic, type Transition } from '@shuji-bonji/experiential-manual-model';
import { findTopic, resolveTarget, type Target } from './lookup.js';
import { applicableSteps, type ScopeSelection } from './scope.js';
import { createStore, type Readable } from './store.js';

export interface Branch {
  transition: Transition;
  /** 行き先。見つからないときは undefined */
  target?: Target;
  /** 同じ Topic の手順なら、その番号 */
  number?: string;
}

export interface ProcedureState {
  topic: Topic;
  /** 適用範囲で絞り込んだ後の、番号付きの手順の一覧（表示の順） */
  steps: NumberedStep[];
  /** 「1 つずつ進める」の今の位置（steps の添字） */
  index: number;
  current: NumberedStep | undefined;
  canPrev: boolean;
  canNext: boolean;
  /** 今の手順の分岐（Step.next） */
  branches: Branch[];
  scope: ScopeSelection;
}

export type NextResult =
  | { type: 'moved'; step: NumberedStep }
  | { type: 'choose'; branches: Branch[] }
  | { type: 'leave'; target: Target }
  | { type: 'notFound'; to: string }
  | { type: 'end' };

export interface ProcedureOptions {
  scope?: ScopeSelection;
  /** 最初に選ぶ手順の id */
  startStep?: string;
}

export interface Procedure extends Readable<ProcedureState> {
  next(): NextResult;
  prev(): boolean;
  goTo(stepId: string): boolean;
  /** branches の 1 つを選ぶ */
  choose(index: number): NextResult;
  setScope(selection: ScopeSelection): void;
}

export function createProcedure(manual: Manual, topicId: string, options: ProcedureOptions = {}): Procedure | undefined {
  const topic = findTopic(manual, topicId);
  if (!topic) return undefined;

  let scope: ScopeSelection = options.scope ?? {};
  let steps = number(scope);
  let index = options.startStep ? Math.max(0, steps.findIndex((n) => n.step.id === options.startStep)) : 0;

  function number(selection: ScopeSelection): NumberedStep[] {
    return numberSteps(applicableSteps(manual, topic?.steps ?? [], selection));
  }

  function branchesOf(step: Step | undefined): Branch[] {
    return (step?.next ?? []).map((transition) => {
      const target = resolveTarget(manual, transition.to);
      const row: Branch = { transition };
      if (target) row.target = target;
      const num = steps.find((n) => n.step.id === transition.to)?.number;
      if (num !== undefined) row.number = num;
      return row;
    });
  }

  function compute(): ProcedureState {
    const current = steps[index];
    return {
      topic: topic as Topic,
      steps,
      index,
      current,
      canPrev: index > 0,
      canNext: index < steps.length - 1 || (current?.step.next?.length ?? 0) > 0,
      branches: branchesOf(current?.step),
      scope
    };
  }

  const store = createStore<ProcedureState>(compute());
  const refresh = () => store.set(compute());

  function follow(transition: Transition): NextResult {
    const i = steps.findIndex((n) => n.step.id === transition.to);
    if (i >= 0) {
      index = i;
      refresh();
      return { type: 'moved', step: steps[i] as NumberedStep };
    }
    const target = resolveTarget(manual, transition.to);
    return target ? { type: 'leave', target } : { type: 'notFound', to: transition.to };
  }

  return {
    subscribe: store.subscribe,
    get: store.get,
    next() {
      const current = steps[index];
      const nexts = current?.step.next ?? [];
      if (nexts.length === 1 && nexts[0] && nexts[0].condition === undefined && nexts[0].when === undefined) {
        return follow(nexts[0]);
      }
      if (nexts.length > 0) return { type: 'choose', branches: branchesOf(current?.step) };
      if (index >= steps.length - 1) return { type: 'end' };
      index += 1;
      refresh();
      return { type: 'moved', step: steps[index] as NumberedStep };
    },
    prev() {
      if (index <= 0) return false;
      index -= 1;
      refresh();
      return true;
    },
    goTo(stepId) {
      const i = steps.findIndex((n) => n.step.id === stepId);
      if (i < 0) return false;
      index = i;
      refresh();
      return true;
    },
    choose(i) {
      const t = steps[index]?.step.next?.[i];
      if (!t) return { type: 'notFound', to: '' };
      return follow(t);
    },
    setScope(selection) {
      const currentId = steps[index]?.step.id;
      scope = selection;
      steps = number(scope);
      const i = currentId ? steps.findIndex((n) => n.step.id === currentId) : -1;
      index = i >= 0 ? i : Math.min(index, Math.max(0, steps.length - 1));
      refresh();
    }
  };
}
