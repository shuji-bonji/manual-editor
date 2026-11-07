/**
 * 困ったとき（kind: troubleshooting）の runtime。P-4 の問答の状態を持つ。
 *
 * - Topic の先頭の手順から始め、Step.question を出し、answers[].next.to で次の手順へ進む。
 * - 次の手順に question が無ければ、そこが対処（resolution）。行き先が別の Topic の手順や画面なら、それを対処として返す。
 * - 選んだ答えの列が履歴。back で 1 つ前の問いに戻る。
 */
import type { Manual, Step, Topic } from '@shuji-bonji/experiential-manual-model';
import { findTopic, resolveTarget, type Target } from './lookup.js';
import { isApplicable, type ScopeSelection } from './scope.js';
import { createStore, type Readable } from './store.js';

export interface Asked {
  step: Step;
  answerIndex: number;
}

export interface AnswerOption {
  text: string;
  target?: Target;
}

export interface TroubleshootingState {
  topic: Topic;
  /** 今の問い（この Topic の手順）。対処に着いたとき、または見つからないときは undefined */
  question: Step | undefined;
  /** 今の問いの答え */
  answers: AnswerOption[];
  /** 対処（question が無い手順、または別の Topic・画面）に着いたとき */
  resolution: Target | undefined;
  /** これまでに答えた問い */
  history: Asked[];
  canBack: boolean;
  scope: ScopeSelection;
}

export type AnswerResult =
  | { type: 'question'; step: Step }
  | { type: 'resolved'; target: Target }
  | { type: 'notFound'; to: string }
  | { type: 'noAnswer'; index: number };

export interface TroubleshootingOptions {
  scope?: ScopeSelection;
}

export interface Troubleshooting extends Readable<TroubleshootingState> {
  answer(index: number): AnswerResult;
  back(): void;
  restart(): void;
  setScope(selection: ScopeSelection): void;
}

export function createTroubleshooting(
  manual: Manual,
  topicId: string,
  options: TroubleshootingOptions = {}
): Troubleshooting | undefined {
  const topic = findTopic(manual, topicId);
  if (!topic) return undefined;
  const first = topic.steps?.[0];
  if (!first) return undefined;

  let scope: ScopeSelection = options.scope ?? {};
  let history: Asked[] = [];
  /** 今いる場所。履歴の末尾の答えの行き先 */
  let current: Target | undefined = { kind: 'step', topic, step: first, parents: [] };

  function compute(): TroubleshootingState {
    const isQuestion = current?.kind === 'step' && current.topic.id === topic?.id && current.step.question !== undefined;
    const question = isQuestion && current?.kind === 'step' ? current.step : undefined;
    const answers: AnswerOption[] = (question?.answers ?? []).map((a) => {
      const target = resolveTarget(manual, a.next.to);
      const row: AnswerOption = { text: a.text };
      if (target && (target.kind !== 'step' || isApplicable(manual, target.step.scopeRefs, scope))) row.target = target;
      return row;
    });
    return {
      topic: topic as Topic,
      question,
      answers,
      resolution: isQuestion ? undefined : current,
      history: [...history],
      canBack: history.length > 0,
      scope
    };
  }

  const store = createStore<TroubleshootingState>(compute());
  const refresh = () => store.set(compute());

  function restart() {
    history = [];
    current = { kind: 'step', topic: topic as Topic, step: first as Step, parents: [] };
    refresh();
  }

  return {
    subscribe: store.subscribe,
    get: store.get,
    answer(index) {
      const state = store.get();
      const question = state.question;
      const a = question?.answers?.[index];
      if (!question || !a) return { type: 'noAnswer', index };
      const target = resolveTarget(manual, a.next.to);
      if (!target) return { type: 'notFound', to: a.next.to };
      history = [...history, { step: question, answerIndex: index }];
      current = target;
      refresh();
      if (target.kind === 'step' && target.topic.id === topic?.id && target.step.question !== undefined) {
        return { type: 'question', step: target.step };
      }
      return { type: 'resolved', target };
    },
    back() {
      const last = history[history.length - 1];
      if (!last) return;
      history = history.slice(0, -1);
      current = { kind: 'step', topic: topic as Topic, step: last.step, parents: [] };
      refresh();
    },
    restart,
    setScope(selection) {
      scope = selection;
      refresh();
    }
  };
}
