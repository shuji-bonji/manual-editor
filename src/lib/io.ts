/**
 * 利用者のファイルの読み書き。編集中の 1 冊をブラウザーの中に置く処理は workspace.ts にある。
 *
 * - parseManualText / serializeManual は純粋な関数で、Vitest で試す。
 * - ファイルを開く・保存する操作は、File System Access API が使えるブラウザーではそれを使い、
 *   使えなければ <input type="file"> とダウンロードで行う。
 */
import { fromLegacyJson, type AssetFile, type Manual } from '@shuji-bonji/experiential-manual-model';

// ---------------------------------------------------------------------------
// JSON の読み込み・書き出し
// ---------------------------------------------------------------------------

export type LoadedKind = 'manual' | 'legacy';

export interface ParsedManual {
  manual: Manual;
  /** manual: manual-model の JSON、legacy: 2021 年の JSON（fromLegacyJson で変換した） */
  kind: LoadedKind;
  /** fromLegacyJson の _warnings 相当（legacy のときだけ入る） */
  warnings: string[];
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * JSON の文字列を Manual にする。
 * manual-model の JSON はそのまま返す（形の検査は validateManual に任せる。壊れたファイルも開いて直せるようにするため）。
 * 2021 年の JSON（purchaseTypes か displayAreas を持つ）は fromLegacyJson で変換する。
 */
export function parseManualText(text: string, options: { newId?: () => string; title?: string } = {}): ParsedManual {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(`JSON として読めません: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!isObj(data)) throw new Error('JSON の最上位がオブジェクトではありません');
  if (Array.isArray(data.topics)) return { manual: data as unknown as Manual, kind: 'manual', warnings: [] };
  if (Array.isArray(data.purchaseTypes) || Array.isArray(data.displayAreas)) {
    const { manual, warnings } = fromLegacyJson(data, {
      id: options.newId?.(),
      title: options.title
    });
    return { manual, kind: 'legacy', warnings };
  }
  throw new Error('manual-model の JSON でも、2021 年の JSON でもありません（topics か purchaseTypes がありません）');
}

/**
 * Manual を JSON の文字列にする。
 * embed に素材 id と data URL の対応を渡すと、その素材の source.data に data URL を入れる（画像を JSON に埋め込む選択肢。model 0.2.0）。
 * source.path のファイル名はそのまま残す。渡さなければ data は入らず、画像は JSON と別に持つ。
 */
export function serializeManual(manual: Manual, embed?: Record<string, string>): string {
  const out = structuredClone(manual);
  if (embed) {
    for (const a of out.assets ?? []) {
      const url = embed[a.id];
      if (!url) continue;
      a.source.data = url;
      const media = /^data:([^;,]+)/.exec(url)?.[1];
      if (media && !a.source.mediaType) a.source.mediaType = media;
    }
  }
  return JSON.stringify(out, null, 2) + '\n';
}

export const isDataUrl = (s: string): boolean => s.startsWith('data:');

/** 素材に埋め込まれた data URL。model 0.2.0 は source.data に、0.1.0 は source.path に入っていた */
export const embeddedData = (f: AssetFile): string | undefined =>
  f.data ?? (f.path !== undefined && isDataUrl(f.path) ? f.path : undefined);

/** 素材のファイル名（path が data URL のときは undefined） */
export const fileName = (f: AssetFile): string | undefined =>
  f.path !== undefined && !isDataUrl(f.path) ? basename(f.path) : undefined;

export const basename = (path: string): string => path.split(/[\\/]/).pop() ?? path;

// ---------------------------------------------------------------------------
// ファイルの入出力（ブラウザーのみ）
// ---------------------------------------------------------------------------

/** File System Access API の、使う分だけの型（TypeScript の標準の型定義には無い） */
interface FileHandleLike {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: Blob | string): Promise<void>; close(): Promise<void> }>;
}
interface PickerWindow {
  showOpenFilePicker?: (o?: unknown) => Promise<FileHandleLike[]>;
  showSaveFilePicker?: (o?: unknown) => Promise<FileHandleLike>;
}

export type FileHandle = FileHandleLike;

export const canUseFilePicker = (): boolean =>
  typeof window !== 'undefined' && typeof (window as PickerWindow).showOpenFilePicker === 'function';

const JSON_TYPES = [{ description: 'manual-model の JSON', accept: { 'application/json': ['.json'] } }];

/** File System Access API でファイルを開く。利用者が取り消したら undefined */
export async function pickJsonFile(): Promise<{ text: string; name: string; handle: FileHandle } | undefined> {
  const w = window as PickerWindow;
  if (!w.showOpenFilePicker) return undefined;
  try {
    const [handle] = await w.showOpenFilePicker({ types: JSON_TYPES, multiple: false });
    const file = await handle.getFile();
    return { text: await file.text(), name: file.name, handle };
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return undefined;
    throw e;
  }
}

/** 名前を付けて保存する。File System Access API が無い・取り消したときは undefined */
export async function pickSaveHandle(suggestedName: string): Promise<FileHandle | undefined> {
  const w = window as PickerWindow;
  if (!w.showSaveFilePicker) return undefined;
  try {
    return await w.showSaveFilePicker({ suggestedName, types: JSON_TYPES });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return undefined;
    throw e;
  }
}

export async function writeToHandle(handle: FileHandle, text: string): Promise<void> {
  const w = await handle.createWritable();
  await w.write(text);
  await w.close();
}

/** ブラウザーのダウンロードとして保存する（File System Access API が無いときの方法） */
export function downloadBlob(name: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const downloadText = (name: string, text: string): void =>
  downloadBlob(name, new Blob([text], { type: 'application/json' }));

// ---------------------------------------------------------------------------
// 画像の補助
// ---------------------------------------------------------------------------

export function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error('画像を読めませんでした'));
    r.readAsDataURL(file);
  });
}

/** "sha256:…" の形のハッシュ。crypto.subtle が使えないとき（http のページなど）は undefined */
export async function sha256Of(file: Blob): Promise<string | undefined> {
  try {
    const buf = await file.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buf);
    return 'sha256:' + [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return undefined;
  }
}

/** 画像の元の大きさ（画素）を調べる。読めなければ undefined */
export function measureImage(url: string): Promise<{ w: number; h: number } | undefined> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve(undefined);
    img.src = url;
  });
}
