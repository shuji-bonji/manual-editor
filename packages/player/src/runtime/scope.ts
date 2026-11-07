/**
 * 適用範囲（Manual.scopes）による絞り込み。
 *
 * 利用者は property ごとに値を 1 つ選ぶ（例: model=MV-50）。選んでいない property は絞り込まない。
 * Topic / Step / Block / Screen の scopeRefs が指す Scope を property ごとにまとめ、
 * 選んでいる property のそれぞれについて、指された Scope のどれかが選んだ値を含むときに「当てはまる」とする。
 * scopeRefs が無い要素は常に当てはまる。存在しない id は無視する（validateManual が警告する）。
 */
import type { Block, Manual, Scope, Screen, Step, Topic } from '@shuji-bonji/experiential-manual-model';

/** property → 選んだ値 */
export type ScopeSelection = Readonly<Record<string, string>>;

/** 適用範囲の選択肢（P-0 の「適用範囲」のプルダウンに使う） */
export interface ScopeProperty {
  property: string;
  /** 選べる値（Manual.scopes に出てくる順） */
  values: Array<{ value: string; displayText: string }>;
}

/** Manual.scopes を property ごとにまとめる */
export function listScopeProperties(manual: Manual): ScopeProperty[] {
  const out: ScopeProperty[] = [];
  for (const scope of manual.scopes ?? []) {
    let entry = out.find((p) => p.property === scope.property);
    if (!entry) {
      entry = { property: scope.property, values: [] };
      out.push(entry);
    }
    for (const value of scope.values) {
      if (!entry.values.some((v) => v.value === value)) {
        entry.values.push({ value, displayText: scope.values.length === 1 ? scope.displayText : value });
      }
    }
  }
  return out;
}

/** `model=MV-50;site=outdoor` の形（Web Components の scope 属性）を読む */
export function parseScopeSelection(text: string | null | undefined): ScopeSelection {
  const out: Record<string, string> = {};
  for (const part of (text ?? '').split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const property = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (property && value) out[property] = value;
  }
  return out;
}

/** scopeRefs がいまの選択に当てはまるか */
export function isApplicable(
  manual: Manual,
  scopeRefs: readonly string[] | undefined,
  selection: ScopeSelection
): boolean {
  if (!scopeRefs || scopeRefs.length === 0) return true;
  const byProperty = new Map<string, Scope[]>();
  for (const ref of scopeRefs) {
    const scope = manual.scopes?.find((s) => s.id === ref);
    if (!scope) continue;
    const list = byProperty.get(scope.property) ?? [];
    list.push(scope);
    byProperty.set(scope.property, list);
  }
  for (const [property, scopes] of byProperty) {
    const chosen = selection[property];
    if (chosen === undefined) continue;
    if (!scopes.some((s) => s.values.includes(chosen))) return false;
  }
  return true;
}

export function applicableTopics(manual: Manual, selection: ScopeSelection): Topic[] {
  return manual.topics.filter((t) => isApplicable(manual, t.scopeRefs, selection));
}

export function applicableScreens(manual: Manual, screens: readonly Screen[], selection: ScopeSelection): Screen[] {
  return screens.filter((s) => isApplicable(manual, s.scopeRefs, selection));
}

/** 手順の木を絞り込む。子も再帰的に絞り込み、当てはまらない手順は子ごと消える */
export function applicableSteps(manual: Manual, steps: readonly Step[], selection: ScopeSelection): Step[] {
  const out: Step[] = [];
  for (const step of steps) {
    if (!isApplicable(manual, step.scopeRefs, selection)) continue;
    if (step.children && step.children.length > 0) {
      out.push({ ...step, children: applicableSteps(manual, step.children, selection) });
    } else {
      out.push(step);
    }
  }
  return out;
}

/** 説明の blocks を絞り込む。children も再帰的に絞り込む */
export function applicableBlocks(manual: Manual, blocks: readonly Block[], selection: ScopeSelection): Block[] {
  const out: Block[] = [];
  for (const block of blocks) {
    if (!isApplicable(manual, block.scopeRefs, selection)) continue;
    if (block.children && block.children.length > 0) {
      out.push({ ...block, children: applicableBlocks(manual, block.children, selection) });
    } else {
      out.push(block);
    }
  }
  return out;
}
