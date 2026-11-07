/**
 * id から Topic / Screen / Step を探す。Transition.to は Screen.id か Step.id のどちらかなので、
 * resolveTarget で両方を探して種類付きで返す。
 */
import type { Manual, Screen, Step, Topic } from '@shuji-bonji/experiential-manual-model';

export interface ScreenHit {
  topic: Topic;
  screen: Screen;
}

export interface StepHit {
  topic: Topic;
  step: Step;
  /** 根から親までの手順（根が先頭）。最上位の手順なら空 */
  parents: Step[];
}

export type Target = ({ kind: 'screen' } & ScreenHit) | ({ kind: 'step' } & StepHit);

export function findTopic(manual: Manual, id: string): Topic | undefined {
  return manual.topics.find((t) => t.id === id);
}

export function findScreen(manual: Manual, id: string): ScreenHit | undefined {
  for (const topic of manual.topics) {
    const screen = topic.screens?.find((s) => s.id === id);
    if (screen) return { topic, screen };
  }
  return undefined;
}

export function findStep(manual: Manual, id: string): StepHit | undefined {
  for (const topic of manual.topics) {
    const hit = findStepIn(topic.steps ?? [], id, []);
    if (hit) return { topic, ...hit };
  }
  return undefined;
}

function findStepIn(steps: readonly Step[], id: string, parents: Step[]): { step: Step; parents: Step[] } | undefined {
  for (const step of steps) {
    if (step.id === id) return { step, parents };
    if (step.children) {
      const hit = findStepIn(step.children, id, [...parents, step]);
      if (hit) return hit;
    }
  }
  return undefined;
}

/** Transition.to（Screen.id または Step.id）の行き先 */
export function resolveTarget(manual: Manual, to: string): Target | undefined {
  const screen = findScreen(manual, to);
  if (screen) return { kind: 'screen', ...screen };
  const step = findStep(manual, to);
  if (step) return { kind: 'step', ...step };
  return undefined;
}

/** screenFlow の Topic の最初の画面（startScreenRef、無ければ先頭） */
export function startScreenOf(topic: Topic): Screen | undefined {
  const screens = topic.screens ?? [];
  if (topic.startScreenRef) {
    const found = screens.find((s) => s.id === topic.startScreenRef);
    if (found) return found;
  }
  return screens[0];
}
