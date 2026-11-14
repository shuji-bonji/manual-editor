/**
 * 作業場所（workspace）。編集中の 1 冊を、ブラウザーの中にフォルダーの形で持つ（設計書 13 節）。
 *
 *   books/<bookId>/manual.json
 *   books/<bookId>/assets/01-start.png
 *
 * - 置き場所は Origin Private File System（OPFS）。利用者のファイルには触れない。
 * - 画像は、どの経路で入ってきても、ここへコピーしてから使う（ブラウザーは元のファイルのパスを知ることができない）。
 * - OPFS が使えないブラウザー（createWritable の無い Safari 25 以前など）では、メモリーに持つ実装に切り替える。
 *   その場合はタブを閉じると消えるので、state.svelte.ts が閉じる前の確認を出す。
 * - WorkspaceStore はインターフェースにしてあり、Vitest ではメモリーの実装で試す。
 */

export const MANUAL_FILE = 'manual.json';
/** 新しく取り込む画像を置くフォルダー（manual.json からの相対パス） */
export const ASSETS_DIR = 'assets';

export interface WorkspaceStore {
  /** 再読み込みの後も残るか。false のときは、タブを閉じると消える */
  readonly persistent: boolean;
  listBooks(): Promise<string[]>;
  readManual(bookId: string): Promise<string | undefined>;
  writeManual(bookId: string, text: string): Promise<void>;
  /** path は manual.json からの相対パス（"assets/a.png"）。無ければ undefined */
  readFile(bookId: string, path: string): Promise<Blob | undefined>;
  writeFile(bookId: string, path: string, data: Blob): Promise<void>;
  removeFile(bookId: string, path: string): Promise<void>;
  /** manual.json を除いた、1 冊の中のファイルの相対パス */
  listFiles(bookId: string): Promise<string[]>;
  removeBook(bookId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// パス
// ---------------------------------------------------------------------------

/**
 * 素材の path を、1 冊のフォルダーの中の相対パスの区切り（"assets", "a.png"）にする。
 * フォルダーの外を指すもの（".."、絶対パス、URL、data URL）と、manual.json 自身は受け付けず undefined を返す。
 * 区切りは "/" と "\" の両方を受け付ける（Windows で作った JSON を読むため）。
 */
export function pathSegments(path: string | undefined): string[] | undefined {
  if (!path) return undefined;
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return undefined; // http:, data:, blob:, C:
  if (path.startsWith('/') || path.startsWith('\\')) return undefined;
  const segs = path.split(/[\\/]+/).filter((s) => s !== '' && s !== '.');
  if (segs.length === 0 || segs.some((s) => s === '..')) return undefined;
  if (segs.length === 1 && segs[0] === MANUAL_FILE) return undefined;
  return segs;
}

/** workspace に置ける path か */
export const isStorablePath = (path: string | undefined): path is string => pathSegments(path) !== undefined;

/** ファイル名を、新しく取り込む画像の path（"assets/<名前>"）にする。フォルダーの部分は捨てる */
export function assetPath(name: string): string {
  const base = name.split(/[\\/]/).pop() || 'image.png';
  return `${ASSETS_DIR}/${base}`;
}

/** bookId をフォルダー名にする（"/" などを含んでも 1 つの名前になるようにする） */
const bookDirName = (bookId: string): string => encodeURIComponent(bookId).replace(/\./g, '%2E') || '_';

// ---------------------------------------------------------------------------
// メモリーの実装（テストと、OPFS が使えないブラウザー）
// ---------------------------------------------------------------------------

export function memoryStore(): WorkspaceStore {
  const books = new Map<string, { manual?: string; files: Map<string, Blob> }>();
  const book = (id: string) => {
    let b = books.get(id);
    if (!b) books.set(id, (b = { files: new Map() }));
    return b;
  };
  const key = (path: string): string => {
    const segs = pathSegments(path);
    if (!segs) throw new Error(`作業場所に置けない path です: ${path}`);
    return segs.join('/');
  };
  return {
    persistent: false,
    async listBooks() {
      return [...books.keys()];
    },
    async readManual(id) {
      return books.get(id)?.manual;
    },
    async writeManual(id, text) {
      book(id).manual = text;
    },
    async readFile(id, path) {
      const segs = pathSegments(path);
      return segs ? books.get(id)?.files.get(segs.join('/')) : undefined;
    },
    async writeFile(id, path, data) {
      book(id).files.set(key(path), data);
    },
    async removeFile(id, path) {
      const segs = pathSegments(path);
      if (segs) books.get(id)?.files.delete(segs.join('/'));
    },
    async listFiles(id) {
      return [...(books.get(id)?.files.keys() ?? [])].sort();
    },
    async removeBook(id) {
      books.delete(id);
    }
  };
}

// ---------------------------------------------------------------------------
// OPFS の実装
// ---------------------------------------------------------------------------

type Dir = FileSystemDirectoryHandle;
/** TypeScript の標準の型定義に、ディレクトリーの列挙が無い版があるので、使う分だけ書く */
type IterableDir = Dir & { entries(): AsyncIterableIterator<[string, FileSystemHandle]> };

const isNotFound = (e: unknown): boolean => e instanceof DOMException && e.name === 'NotFoundError';

async function childDir(parent: Dir, name: string, create: boolean): Promise<Dir | undefined> {
  try {
    return await parent.getDirectoryHandle(name, { create });
  } catch (e) {
    if (!create && isNotFound(e)) return undefined;
    throw e;
  }
}

async function writeBlob(dir: Dir, name: string, data: Blob | string): Promise<void> {
  const handle = await dir.getFileHandle(name, { create: true });
  const w = await handle.createWritable();
  try {
    await w.write(data);
  } finally {
    await w.close();
  }
}

async function readBlob(dir: Dir, name: string): Promise<File | undefined> {
  try {
    return await (await dir.getFileHandle(name)).getFile();
  } catch (e) {
    if (isNotFound(e)) return undefined;
    throw e;
  }
}

function opfsStore(root: Dir): WorkspaceStore {
  const booksDir = (create: boolean) => childDir(root, 'books', create);
  const bookDir = async (id: string, create: boolean) => {
    const b = await booksDir(create);
    return b ? childDir(b, bookDirName(id), create) : undefined;
  };
  /** path のフォルダーまで降りる。[フォルダー, ファイル名] を返す */
  const locate = async (id: string, path: string, create: boolean): Promise<[Dir, string] | undefined> => {
    const segs = pathSegments(path);
    if (!segs) {
      if (create) throw new Error(`作業場所に置けない path です: ${path}`);
      return undefined;
    }
    let dir = await bookDir(id, create);
    for (const s of segs.slice(0, -1)) {
      if (!dir) return undefined;
      dir = await childDir(dir, s, create);
    }
    return dir ? [dir, segs[segs.length - 1]] : undefined;
  };
  const walk = async (dir: Dir, prefix: string, out: string[]): Promise<void> => {
    for await (const [name, handle] of (dir as IterableDir).entries()) {
      if (handle.kind === 'directory') await walk(handle as Dir, `${prefix}${name}/`, out);
      else if (!(prefix === '' && name === MANUAL_FILE)) out.push(prefix + name);
    }
  };
  return {
    persistent: true,
    async listBooks() {
      const b = await booksDir(false);
      if (!b) return [];
      const out: string[] = [];
      for await (const [name, handle] of (b as IterableDir).entries()) if (handle.kind === 'directory') out.push(decodeURIComponent(name));
      return out.sort();
    },
    async readManual(id) {
      const dir = await bookDir(id, false);
      return dir ? (await readBlob(dir, MANUAL_FILE))?.text() : undefined;
    },
    async writeManual(id, text) {
      await writeBlob((await bookDir(id, true))!, MANUAL_FILE, text);
    },
    async readFile(id, path) {
      const at = await locate(id, path, false);
      return at ? readBlob(at[0], at[1]) : undefined;
    },
    async writeFile(id, path, data) {
      const at = (await locate(id, path, true))!;
      await writeBlob(at[0], at[1], data);
    },
    async removeFile(id, path) {
      const at = await locate(id, path, false);
      if (!at) return;
      try {
        await at[0].removeEntry(at[1]);
      } catch (e) {
        if (!isNotFound(e)) throw e;
      }
    },
    async listFiles(id) {
      const dir = await bookDir(id, false);
      if (!dir) return [];
      const out: string[] = [];
      await walk(dir, '', out);
      return out.sort();
    },
    async removeBook(id) {
      const b = await booksDir(false);
      if (!b) return;
      try {
        await b.removeEntry(bookDirName(id), { recursive: true });
      } catch (e) {
        if (!isNotFound(e)) throw e;
      }
    }
  };
}

/**
 * このブラウザーで使える作業場所を返す。OPFS に実際に 1 回書いて確かめ、書けなければメモリーの実装を返す
 * （getDirectory はあっても createWritable が無いブラウザーがあるため、有無の検査だけでは足りない）。
 */
export async function openWorkspace(): Promise<WorkspaceStore> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) return memoryStore();
    const root = await navigator.storage.getDirectory();
    await writeBlob(root, '.probe', 'ok');
    await root.removeEntry('.probe');
    return opfsStore(root);
  } catch {
    return memoryStore();
  }
}

/** 作業場所を、容量が足りなくなってもブラウザーが勝手に消さないよう求める。断られても編集は続けられる */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
    return (await navigator.storage.persisted()) || (await navigator.storage.persist());
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// 前回の続き（localStorage には、どの 1 冊を開いていたかだけを置く）
// ---------------------------------------------------------------------------

const SESSION_KEY = 'experiential-manual-editor:session:v1';

export interface Session {
  bookId: string;
  /** 上の帯に出すファイル名 */
  fileName: string;
  /** 利用者のファイルにまだ保存していない変更があるか */
  dirty: boolean;
}

export function saveSession(s: Session): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch {
    /* 書けなくても編集は続けられる。次に開いたときに続きから始まらないだけ */
  }
}

export function loadSession(): Session | undefined {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return undefined;
    const s = JSON.parse(raw) as Partial<Session>;
    return typeof s.bookId === 'string' && typeof s.fileName === 'string' ? { bookId: s.bookId, fileName: s.fileName, dirty: s.dirty === true } : undefined;
  } catch {
    return undefined;
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* 消せなくても編集は続けられる */
  }
}
