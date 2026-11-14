/**
 * 1 冊のまとまり（manual.json と、そこから相対パスで指す画像）を、zip やフォルダーから取り出す・zip に詰める。
 * 純粋な関数だけを置き、Vitest で試す。作業場所への読み書きは state.svelte.ts が行う（設計書 13.2・13.4 節）。
 */
import type { Manual } from '@shuji-bonji/experiential-manual-model';
import { ASSETS_DIR, MANUAL_FILE, pathSegments } from './workspace';
import { zipStore, type ZipEntry } from './zip';

/**
 * 保存するファイルの拡張子。中身は zip（manual.json ＋ assets/）だが、利用者には「マニュアルのファイル」1 つとして見せる。
 * 拡張子を .zip に変えれば、ふつうの zip として展開できる。
 */
export const BUNDLE_EXT = '.emanual';

const norm = (path: string): string => path.split(/[\\/]+/).filter((s) => s !== '' && s !== '.').join('/');

/** OS が勝手に足すファイル（macOS の __MACOSX・.DS_Store、Windows の Thumbs.db）と、隠しファイル */
const isJunk = (path: string): boolean => path.split('/').some((s) => s === '__MACOSX' || s.startsWith('.') || s === 'Thumbs.db');

export interface ManualLocation {
  /** manual.json のあるフォルダー（末尾に "/"。最上位なら ""） */
  root: string;
  /** manual の JSON のパス（渡した paths の中の 1 つを、区切りを "/" に揃えたもの） */
  path: string;
}

/**
 * zip やフォルダーの中から、manual の JSON を 1 つ決める。
 * 1. 名前が manual.json のもの（いちばん浅いもの）
 * 2. 名前が *.manual.json のもの（いちばん浅いもの）
 * 3. .json が全体で 1 つだけなら、それ（2021 年の JSON のフォルダーなど）
 * zip を OS の機能で作ると、最上位にフォルダーが 1 段入ることがあるので、深さは問わない。
 */
export function locateManual(paths: string[]): ManualLocation | undefined {
  const all = paths.map(norm).filter((p) => p !== '' && !isJunk(p));
  const depth = (p: string) => p.split('/').length;
  const shallowest = (list: string[]) => [...list].sort((a, b) => depth(a) - depth(b) || a.localeCompare(b))[0];
  const base = (p: string) => p.slice(p.lastIndexOf('/') + 1);
  const pick =
    shallowest(all.filter((p) => base(p) === MANUAL_FILE)) ??
    shallowest(all.filter((p) => base(p).toLowerCase().endsWith('.manual.json'))) ??
    (() => {
      const jsons = all.filter((p) => p.toLowerCase().endsWith('.json'));
      return jsons.length === 1 ? jsons[0] : undefined;
    })();
  return pick ? { root: pick.slice(0, pick.lastIndexOf('/') + 1), path: pick } : undefined;
}

export interface BundleParts<T> {
  /** manual の JSON */
  manual: { path: string; data: T };
  /** manual.json からの相対パスにした、その他のファイル（作業場所に置けるものだけ） */
  files: { path: string; data: T }[];
}

/** zip やフォルダーの中身を、manual の JSON と、そこからの相対パスのファイルに分ける。JSON が決まらなければ undefined */
export function splitBundle<T>(entries: { path: string; data: T }[]): BundleParts<T> | undefined {
  const loc = locateManual(entries.map((e) => e.path));
  if (!loc) return undefined;
  let manual: { path: string; data: T } | undefined;
  const files: { path: string; data: T }[] = [];
  for (const e of entries) {
    const p = norm(e.path);
    if (p === loc.path) manual = { path: p, data: e.data };
    else if (p.startsWith(loc.root) && !isJunk(p)) {
      const rel = p.slice(loc.root.length);
      if (pathSegments(rel)) files.push({ path: rel, data: e.data });
    }
  }
  return manual ? { manual, files } : undefined;
}

export type BundleCheck<T> = { ok: true; parts: BundleParts<T> } | { ok: false; reason: 'no-manual' | 'unexpected'; paths: string[] };

/**
 * マニュアルのファイル（.emanual）の中身が、決まった構成になっているかを確かめる（設計書 13.2 節）。
 *
 *   manual.json
 *   assets/…
 *
 * - manual.json が最上位に無ければ受け付けない。ただし、OS の機能でフォルダーごと固め直した zip
 *   （最上位にフォルダーが 1 つだけあり、その中が上の構成）は受け付ける。
 * - manual.json と assets/ 以外のものが入っていれば受け付けず、その path を返す（黙って捨てると、中身が欠けたことに気づけないため）。
 * - OS が勝手に足すファイル（__MACOSX、.DS_Store、Thumbs.db）は無視する。
 * 構成の違うもの（展開して手で直したフォルダー、2021 年の JSON）は、splitBundle を使う「取り込み」で読む。
 */
export function checkBundle<T>(entries: { path: string; data: T }[]): BundleCheck<T> {
  const all = entries.map((e) => ({ path: norm(e.path), data: e.data })).filter((e) => e.path !== '' && !isJunk(e.path));
  let root = '';
  if (!all.some((e) => e.path === MANUAL_FILE)) {
    const tops = new Set(all.map((e) => e.path.split('/')[0]));
    const top = tops.size === 1 ? `${[...tops][0]}/` : undefined;
    if (!top || !all.some((e) => e.path === top + MANUAL_FILE)) return { ok: false, reason: 'no-manual', paths: [] };
    root = top;
  }
  let manual: { path: string; data: T } | undefined;
  const files: { path: string; data: T }[] = [];
  const unexpected: string[] = [];
  for (const e of all) {
    const rel = e.path.slice(root.length);
    if (rel === MANUAL_FILE) manual = e;
    else if (rel.startsWith(`${ASSETS_DIR}/`) && pathSegments(rel)) files.push({ path: rel, data: e.data });
    else unexpected.push(rel);
  }
  if (unexpected.length > 0) return { ok: false, reason: 'unexpected', paths: unexpected.sort() };
  return { ok: true, parts: { manual: manual!, files } };
}

/**
 * 素材の path を assets/ の下に揃える（取り込みのとき。img/a.png → assets/a.png）。
 * 保存するファイルの構成を manual.json ＋ assets/ に保つため。同じ名前が重なれば番号を足す。
 * 作業場所に置けない path（URL など）と、既に assets/ の下にあるものは変えない。
 * moves は、変えた path の対応（from は元の相対パス、to は新しい相対パス）。
 */
export function normalizeAssetPaths(manual: Manual): { manual: Manual; moves: { from: string; to: string }[] } {
  const inAssets = (p: string) => p.startsWith(`${ASSETS_DIR}/`);
  const current = (manual.assets ?? []).map((a) => pathSegments(a.source.path)?.join('/'));
  const used = new Set(current.filter((p): p is string => p !== undefined && inAssets(p)));
  const moved = new Map<string, string>();
  for (const from of current) {
    if (from === undefined || inAssets(from) || moved.has(from)) continue;
    const base = from.slice(from.lastIndexOf('/') + 1);
    const dot = base.lastIndexOf('.');
    const stem = dot > 0 ? base.slice(0, dot) : base;
    const ext = dot > 0 ? base.slice(dot) : '';
    let to = `${ASSETS_DIR}/${base}`;
    for (let n = 2; used.has(to); n++) to = `${ASSETS_DIR}/${stem}-${n}${ext}`;
    used.add(to);
    moved.set(from, to);
  }
  if (moved.size === 0) return { manual, moves: [] };
  const out = structuredClone(manual);
  (out.assets ?? []).forEach((a, i) => {
    const from = current[i];
    const to = from === undefined ? undefined : moved.get(from);
    if (to) a.source.path = to;
  });
  return { manual: out, moves: [...moved].map(([from, to]) => ({ from, to })) };
}

/** Manual が指している画像の path（作業場所に置ける相対パスだけ。重なりは 1 つにまとめる） */
export function referencedPaths(manual: Manual): string[] {
  const out = new Set<string>();
  for (const a of manual.assets ?? []) {
    const segs = pathSegments(a.source.path);
    if (segs) out.add(segs.join('/'));
  }
  return [...out].sort();
}

/**
 * 1 冊を zip にする。入れるのは manual.json と、Manual が指している画像だけ（使われなくなった画像は入れない）。
 * read が undefined を返した画像は入れず、missing に path を返す。
 */
export async function buildBundle(
  manual: Manual,
  manualText: string,
  read: (path: string) => Promise<Uint8Array | undefined>,
  date: Date = new Date()
): Promise<{ zip: Uint8Array; missing: string[] }> {
  const entries: ZipEntry[] = [{ path: MANUAL_FILE, data: new TextEncoder().encode(manualText) }];
  const missing: string[] = [];
  for (const path of referencedPaths(manual)) {
    const data = await read(path);
    if (data) entries.push({ path, data });
    else missing.push(path);
  }
  return { zip: zipStore(entries, date), missing };
}

/** 題名から、保存するファイル名の案を作る（ファイル名に使えない文字は "-" にする） */
export function suggestedBundleName(title: string): string {
  const stem = title
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .slice(0, 80);
  return (stem || 'manual') + BUNDLE_EXT;
}

/** 開いたファイルやフォルダーの名前から、保存するファイル名を作る（kenbaiki.manual.json → kenbaiki.emanual） */
export function bundleNameFrom(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  if (base.toLowerCase().endsWith(BUNDLE_EXT)) return base;
  const stem = base.replace(/\.(emanual|manual\.zip|manual\.json|json|zip)$/i, '');
  return (stem || 'manual') + BUNDLE_EXT;
}
