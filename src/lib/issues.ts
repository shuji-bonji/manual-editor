/**
 * validateManual が返す場所（JSON Pointer 風の文字列）と文から、画面の上の場所（Topic・画面・ホットスポット・手順・素材・適用範囲）を求める。
 * 検査の一覧（E-7）で項目を押したときに該当の場所へ移るためと、場所と文を人が読める形で出すために使う。
 */
import type { Manual, Step, ValidationIssue } from '@shuji-bonji/experiential-manual-model';
import { t } from './i18n';

export interface IssueLocation {
  topicId?: string;
  screenId?: string;
  hotspotId?: string;
  stepId?: string;
  assetId?: string;
  scopeId?: string;
  /** 移る先: topic = 構成ツリーの Topic・画面・手順、assets = 素材の引き出し、manual = マニュアルの情報と適用範囲（インスペクター） */
  area: 'topic' | 'assets' | 'manual';
}

const quoted = (message: string, word: string): string | undefined => new RegExp(`${word} "([^"]+)"`).exec(message)?.[1];

export function locateIssue(m: Manual, path: string, message = ''): IssueLocation {
  const seg = path.split('/').filter((s) => s !== '');
  if (seg[0] === 'assets') {
    const byIndex = seg[1] !== undefined ? m.assets?.[Number(seg[1])]?.id : undefined;
    return { area: 'assets', assetId: byIndex ?? quoted(message, 'asset') };
  }
  if (seg[0] === 'scopes') {
    const byIndex = seg[1] !== undefined ? m.scopes?.[Number(seg[1])]?.id : undefined;
    return { area: 'manual', scopeId: byIndex ?? quoted(message, 'scope') };
  }
  if (seg[0] !== 'topics') return { area: 'manual' };
  const topic = m.topics[Number(seg[1])];
  if (!topic) return { area: 'manual' };
  const loc: IssueLocation = { topicId: topic.id, area: 'topic' };
  if (seg[2] === 'screens') {
    const screen = topic.screens?.[Number(seg[3])];
    if (screen) {
      loc.screenId = screen.id;
      if (seg[4] === 'hotspots') {
        const h = screen.hotspots?.[Number(seg[5])];
        if (h) loc.hotspotId = h.id;
      }
    } else {
      // 「screen "x" cannot be reached」は /topics/N/screens を指すので、文の中の id から画面を探す
      const id = quoted(message, 'screen');
      if (id && topic.screens?.some((s) => s.id === id)) loc.screenId = id;
    }
  } else if (seg[2] === 'steps') {
    // steps/N(/children/N)* をたどる
    let list: Step[] | undefined = topic.steps;
    let i = 3;
    let step: Step | undefined;
    while (list && seg[i] !== undefined && /^\d+$/.test(seg[i])) {
      step = list[Number(seg[i])];
      if (!step) break;
      loc.stepId = step.id;
      if (seg[i + 1] === 'children') {
        list = step.children;
        i += 2;
      } else break;
    }
  }
  // 素材の参照切れ（assetRef）は、素材の引き出しではなく参照している場所へ移る
  if (!loc.assetId) {
    const asset = quoted(message, 'asset');
    if (asset) loc.assetId = asset;
  }
  return loc;
}

function findStep(list: Step[] | undefined, id: string): Step | undefined {
  for (const s of list ?? []) {
    if (s.id === id) return s;
    const c = findStep(s.children, id);
    if (c) return c;
  }
  return undefined;
}

/** 場所を「Topic › 画面 › ホットスポット」のように、人が読む名前の列にする */
export function describeLocation(m: Manual, loc: IssueLocation): string[] {
  const crumbs: string[] = [];
  if (loc.area === 'assets') {
    crumbs.push(t('check.where.assets'));
    const a = loc.assetId ? m.assets?.find((x) => x.id === loc.assetId) : undefined;
    if (a) crumbs.push(a.alt || a.source.path || a.id);
    else if (loc.assetId) crumbs.push(loc.assetId);
    return crumbs;
  }
  if (loc.area === 'manual') {
    crumbs.push(t('check.where.manual'));
    const s = loc.scopeId ? m.scopes?.find((x) => x.id === loc.scopeId) : undefined;
    if (s) crumbs.push(s.displayText || s.id);
    else if (loc.scopeId) crumbs.push(loc.scopeId);
    return crumbs;
  }
  const topic = m.topics.find((x) => x.id === loc.topicId);
  if (!topic) return crumbs;
  crumbs.push(topic.title || topic.id);
  const screen = topic.screens?.find((s) => s.id === loc.screenId);
  if (screen) {
    crumbs.push(screen.caption || screen.id);
    const h = screen.hotspots.find((x) => x.id === loc.hotspotId);
    if (h) crumbs.push(h.label || h.id);
  }
  const step = loc.stepId ? findStep(topic.steps, loc.stepId) : undefined;
  if (step) crumbs.push(step.text || step.question || step.id);
  return crumbs;
}

/** validateManual の英語の文のうち、よく出るものを日本語にする。当てはまらなければ undefined（元の文をそのまま出す） */
export function glossIssue(message: string): string | undefined {
  let mt: RegExpExecArray | null;
  if ((mt = /^screen "([^"]+)" cannot be reached from "([^"]+)"$/.exec(message))) return t('check.msg.unreachable', { id: mt[1], start: mt[2] });
  if ((mt = /^transition target "([^"]+)" is not a screen or step id$/.exec(message))) return t('check.msg.brokenTransition', { to: mt[1] });
  if ((mt = /^asset "([^"]+)" is not used$/.exec(message))) return t('check.msg.unusedAsset', { id: mt[1] });
  if ((mt = /^asset "([^"]+)" is not defined in assets$/.exec(message))) return t('check.msg.missingAsset', { id: mt[1] });
  if ((mt = /^scope "([^"]+)" is not used$/.exec(message))) return t('check.msg.unusedScope', { id: mt[1] });
  if ((mt = /^scope "([^"]+)" is referenced but not defined$/.exec(message))) return t('check.msg.missingScope', { id: mt[1] });
  if ((mt = /^startScreenRef "([^"]+)" is not a screen of this topic$/.exec(message))) return t('check.msg.badStart', { id: mt[1] });
  if ((mt = /^targetRef "([^"]+)" is not a hotspot or block id$/.exec(message))) return t('check.msg.badTarget', { id: mt[1] });
  if (message === 'screenFlow topic has no screens') return t('check.msg.noScreens');
  if (message === 'procedure topic has no steps') return t('check.msg.noSteps');
  if (message === 'description topic has no blocks') return t('check.msg.noBlocks');
  if (message === 'either path or data is required') return t('check.msg.noSource');
  if ((mt = /^(rect|circle|poly) needs (.+), got (\d+)$/.exec(message))) return t('check.msg.coords', { shape: t(`shape.${mt[1]}` as 'shape.rect'), need: mt[2], got: mt[3] });
  if ((mt = /^(\w+) must be a non-empty string$/.exec(message))) return t('check.msg.required', { key: mt[1] });
  return undefined;
}

/** 一覧の 1 行に出す形 */
export interface IssueRow {
  issue: ValidationIssue;
  kind: 'err' | 'warn';
  loc: IssueLocation;
  crumbs: string[];
  /** 日本語の文（無ければ元の文） */
  text: string;
  /** 遷移の地図で見られる（到達できない画面） */
  mappable: boolean;
}

export function toIssueRows(m: Manual, issues: ValidationIssue[], kind: 'err' | 'warn'): IssueRow[] {
  return issues.map((issue) => {
    const loc = locateIssue(m, issue.path, issue.message);
    return {
      issue,
      kind,
      loc,
      crumbs: describeLocation(m, loc),
      text: glossIssue(issue.message) ?? issue.message,
      mappable: issue.message.includes('cannot be reached') && !!loc.screenId
    };
  });
}
