/**
 * validateManual が返す場所（JSON Pointer 風の文字列）から、画面の上の場所（Topic・画面・ホットスポット・手順）を求める。
 * 検査の一覧で項目を押したときに、該当の場所へ移るために使う。
 */
import type { Manual, Step } from '@shuji-bonji/experiential-manual-model';

export interface IssueLocation {
  topicId?: string;
  screenId?: string;
  hotspotId?: string;
  stepId?: string;
  /** 移る先: topic = 編集タブ、library = 適用範囲・素材・マニュアルの情報のタブ */
  area: 'topic' | 'library';
}

export function locateIssue(m: Manual, path: string): IssueLocation {
  const seg = path.split('/').filter((s) => s !== '');
  if (seg[0] === 'scopes' || seg[0] === 'assets' || seg[0] === 'glossary') return { area: 'library' };
  if (seg[0] !== 'topics') return { area: 'library' };
  const topic = m.topics[Number(seg[1])];
  if (!topic) return { area: 'library' };
  const loc: IssueLocation = { topicId: topic.id, area: 'topic' };
  if (seg[2] === 'screens') {
    const screen = topic.screens?.[Number(seg[3])];
    if (screen) {
      loc.screenId = screen.id;
      if (seg[4] === 'hotspots') {
        const h = screen.hotspots?.[Number(seg[5])];
        if (h) loc.hotspotId = h.id;
      }
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
  return loc;
}
