/**
 * 画面全体で共有する状態。Manual（manual-model の型）を 1 つ持ち、編集は ops.ts の純粋な関数を通して行う。
 *
 * - manual は `$state.raw`。ops.ts が毎回新しい Manual を返すので、深い監視（Proxy）は要らない。
 *   Proxy にすると structuredClone が使えなくなるため、raw にしている。
 * - 画像は Manual の外（images）に持つ。Manual に入るのは Asset.source.path（ファイル名）だけ。
 * - 元に戻す・やり直しは、Manual の履歴（最大 100 件）で行う。同じ欄への連続した入力は 1 回にまとめる。
 */
import { SvelteMap } from 'svelte/reactivity';
import { validateManual, type Manual, type TopicKind } from '@shuji-bonji/experiential-manual-model';
import { base } from '$app/paths';
import {
  OpError,
  addAsset,
  addScreen,
  addTopic,
  newManual,
  type Added
} from './ops';
import {
  basename,
  canUseFilePicker,
  clearDraft,
  downloadBlob,
  downloadText,
  fileToDataUrl,
  isDataUrl,
  loadDraft,
  measureImage,
  parseManualText,
  pickJsonFile,
  pickSaveHandle,
  saveDraft,
  serializeManual,
  sha256Of,
  writeToHandle,
  type Draft,
  type FileHandle
} from './io';
import { t } from './i18n';

export type Tab = 'edit' | 'library' | 'check' | 'play';

export interface Notice {
  id: number;
  kind: 'info' | 'warn' | 'error';
  text: string;
}

export interface Selection {
  topicId?: string;
  screenId?: string;
  hotspotId?: string;
  stepId?: string;
}

const HISTORY_LIMIT = 100;

class EditorState {
  manual = $state.raw<Manual>(newManual(crypto.randomUUID(), t('manual.untitled')));
  fileName = $state('manual.json');
  dirty = $state(false);
  tab = $state<Tab>('edit');
  selection = $state<Selection>({});
  notices = $state.raw<Notice[]>([]);
  /** 保存時に画像を data URL にして JSON に埋め込むか */
  embedImages = $state(false);
  /** 前回の下書き（復元するか尋ねる）。無ければ undefined */
  pendingDraft = $state.raw<Draft | undefined>(undefined);
  canPick = $state(false);

  /** 素材 id → 表示用の URL（object URL・data URL・同梱サンプルの URL） */
  images = new SvelteMap<string, string>();
  /** 素材 id → 画像の元の大きさ（画素） */
  sizes = new SvelteMap<string, { w: number; h: number }>();

  validation = $derived(validateManual(this.manual));
  topic = $derived(this.manual.topics.find((x) => x.id === this.selection.topicId));

  private undoStack: Manual[] = [];
  private redoStack: Manual[] = [];
  private lastCoalesce: string | undefined;
  private handle: FileHandle | undefined;
  private noticeSeq = 0;
  private blobUrls = new Set<string>();

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** ブラウザーで起動したあとに 1 回呼ぶ（localStorage と File System Access API を調べる） */
  init(): void {
    this.canPick = canUseFilePicker();
    this.pendingDraft = loadDraft();
  }

  // ---- 通知 ---------------------------------------------------------------

  notify(kind: Notice['kind'], text: string): void {
    this.notices = [...this.notices, { id: ++this.noticeSeq, kind, text }];
  }
  dismiss(id: number): void {
    this.notices = this.notices.filter((n) => n.id !== id);
  }
  clearNotices(): void {
    this.notices = [];
  }

  // ---- 編集 ---------------------------------------------------------------

  /**
   * ops.ts の関数を適用する。Added（id つき）を返す関数なら id を返す。
   * coalesce に同じ文字列を続けて渡すと、履歴を 1 件にまとめる（テキスト欄の入力用）。
   */
  apply(fn: (m: Manual) => Manual | Added, coalesce?: string): string | undefined {
    try {
      const r = fn(this.manual);
      const next = 'manual' in r && 'id' in r ? r.manual : (r as Manual);
      const id = 'manual' in r && 'id' in r ? r.id : undefined;
      if (!(coalesce && coalesce === this.lastCoalesce)) {
        this.undoStack.push(this.manual);
        if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
      }
      this.lastCoalesce = coalesce;
      this.redoStack = [];
      this.manual = next;
      this.dirty = true;
      return id;
    } catch (e) {
      if (e instanceof OpError) this.notify('error', e.message);
      else throw e;
      return undefined;
    }
  }

  undo(): void {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.redoStack.push(this.manual);
    this.manual = prev;
    this.lastCoalesce = undefined;
    this.dirty = true;
    this.fixSelection();
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(this.manual);
    this.manual = next;
    this.lastCoalesce = undefined;
    this.dirty = true;
    this.fixSelection();
  }

  /** 選択中の id が Manual から消えていたら、選択を外す（Topic は先頭に、画面は開始画面に寄せる） */
  fixSelection(): void {
    const s = this.selection;
    const topic = this.manual.topics.find((x) => x.id === s.topicId) ?? this.manual.topics[0];
    let screen = topic?.screens?.find((x) => x.id === s.screenId);
    if (!screen && topic?.screens?.length)
      screen = topic.screens.find((x) => x.id === topic.startScreenRef) ?? topic.screens[0];
    const hotspot = screen?.hotspots.find((h) => h.id === s.hotspotId);
    this.selection = { topicId: topic?.id, screenId: screen?.id, hotspotId: hotspot?.id, stepId: s.stepId };
  }

  select(sel: Selection): void {
    this.selection = { ...sel };
  }

  selectTopic(topicId: string | undefined): void {
    const topic = this.manual.topics.find((x) => x.id === topicId);
    this.selection = {
      topicId: topic?.id,
      screenId: topic?.screens?.length ? (topic.startScreenRef ?? topic.screens[0].id) : undefined
    };
  }

  createTopic(kind: TopicKind): void {
    const id = this.apply((m) => addTopic(m, kind, t('topic.newTitle', { n: m.topics.length + 1 })));
    this.selectTopic(id);
    this.tab = 'edit';
  }

  // ---- 画像 ---------------------------------------------------------------

  private setImage(assetId: string, url: string, size?: { w: number; h: number }): void {
    const old = this.images.get(assetId);
    if (old && this.blobUrls.has(old)) {
      URL.revokeObjectURL(old);
      this.blobUrls.delete(old);
    }
    this.images.set(assetId, url);
    if (url.startsWith('blob:')) this.blobUrls.add(url);
    if (size) this.sizes.set(assetId, size);
    else this.sizes.delete(assetId);
  }

  /** 画像ファイルを素材 assetId の画像として割り当てる（Manual は変えない） */
  async attachImage(assetId: string, file: Blob): Promise<boolean> {
    const url = URL.createObjectURL(file);
    const size = await measureImage(url);
    if (!size) {
      URL.revokeObjectURL(url);
      this.notify('error', t('image.unreadable'));
      return false;
    }
    this.setImage(assetId, url, size);
    return true;
  }

  /** 画像ファイルから素材と画面を作る（screenFlow の Topic に画面を足す） */
  async addScreensFromFiles(topicId: string, files: File[]): Promise<void> {
    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        this.notify('warn', t('image.notImage', { name: file.name }));
        continue;
      }
      const hash = await sha256Of(file);
      const assetId = this.apply((m) =>
        addAsset(m, { filename: file.name, mediaType: file.type, alt: file.name.replace(/\.[^.]+$/, ''), hash })
      );
      if (!assetId) continue;
      if (!(await this.attachImage(assetId, file))) continue;
      const screenId = this.apply((m) =>
        addScreen(m, topicId, assetId, t('screen.defaultCaption', { n: (m.topics.find((x) => x.id === topicId)?.screens?.length ?? 0) + 1 }))
      );
      if (screenId) this.selection = { topicId, screenId };
    }
  }

  /** 複数の画像ファイルを、Asset.source.path のファイル名で照合して割り当てる。割り当てた件数を返す */
  async assignImagesByName(files: File[]): Promise<number> {
    let n = 0;
    for (const file of files) {
      const targets = (this.manual.assets ?? []).filter((a) => basename(a.source.path) === file.name);
      for (const a of targets) if (await this.attachImage(a.id, file)) n++;
    }
    if (n < files.length) this.notify('warn', t('image.assignPartial', { n, total: files.length }));
    else this.notify('info', t('image.assigned', { n }));
    return n;
  }

  /** 読み込んだ Manual の素材のうち、data URL のものはそのまま画像にする。baseUrl があれば相対パスも読みに行く */
  private async resolveImages(manual: Manual, baseUrl?: string): Promise<void> {
    for (const url of this.blobUrls) URL.revokeObjectURL(url);
    this.blobUrls.clear();
    this.images.clear();
    this.sizes.clear();
    for (const a of manual.assets ?? []) {
      if (a.kind !== 'image') continue;
      const path = a.source.path;
      const url = isDataUrl(path) ? path : baseUrl ? new URL(path, baseUrl).href : undefined;
      if (!url) continue;
      const size = await measureImage(url);
      if (size) this.setImage(a.id, url, size);
    }
  }

  // ---- 開く・保存する --------------------------------------------------------

  private async load(text: string, name: string, handle?: FileHandle, baseUrl?: string): Promise<void> {
    const parsed = parseManualText(text, {
      newId: () => crypto.randomUUID(),
      title: name.replace(/\.json$/i, '')
    });
    this.manual = parsed.manual;
    this.undoStack = [];
    this.redoStack = [];
    this.lastCoalesce = undefined;
    this.handle = handle;
    this.pendingDraft = undefined;
    this.fileName = parsed.kind === 'legacy' ? name.replace(/\.json$/i, '') + '.manual.json' : name;
    this.dirty = parsed.kind === 'legacy';
    this.notices = [];
    if (parsed.kind === 'legacy') {
      this.notify('info', t('open.legacy'));
      for (const w of parsed.warnings) this.notify('warn', w);
    }
    this.selectTopic(this.manual.topics[0]?.id);
    this.tab = 'edit';
    await this.resolveImages(this.manual, baseUrl);
    const missing = (this.manual.assets ?? []).filter((a) => a.kind === 'image' && !this.images.has(a.id)).length;
    if (missing > 0) this.notify('warn', t('open.missingImages', { n: missing }));
  }

  /** <input type="file"> で選ばれたファイルを開く */
  async openFile(file: File): Promise<void> {
    try {
      await this.load(await file.text(), file.name);
    } catch (e) {
      this.notify('error', e instanceof Error ? e.message : String(e));
    }
  }

  /** File System Access API で開く（上書き保存ができる） */
  async openWithPicker(): Promise<void> {
    try {
      const r = await pickJsonFile();
      if (r) await this.load(r.text, r.name, r.handle);
    } catch (e) {
      this.notify('error', e instanceof Error ? e.message : String(e));
    }
  }

  /** 同梱のサンプル（券売機の例）を開く */
  async openExample(): Promise<void> {
    try {
      const baseUrl = new URL(`${base}/examples/kenbaiki.manual.json`, location.href).href;
      const res = await fetch(baseUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await this.load(await res.text(), 'kenbaiki.manual.json', undefined, baseUrl);
      this.notify('info', t('open.exampleNote'));
    } catch (e) {
      this.notify('error', t('open.exampleFailed', { reason: e instanceof Error ? e.message : String(e) }));
    }
  }

  newDocument(): void {
    this.manual = newManual(crypto.randomUUID(), t('manual.untitled'));
    this.undoStack = [];
    this.redoStack = [];
    this.handle = undefined;
    this.pendingDraft = undefined;
    this.fileName = 'manual.json';
    this.dirty = false;
    this.notices = [];
    this.images.clear();
    this.sizes.clear();
    this.selection = {};
    this.tab = 'edit';
  }

  private async serialize(): Promise<string> {
    if (!this.embedImages) return serializeManual(this.manual);
    const embed: Record<string, string> = {};
    for (const a of this.manual.assets ?? []) {
      const url = this.images.get(a.id);
      if (!url) continue;
      if (isDataUrl(url)) embed[a.id] = url;
      else {
        try {
          embed[a.id] = await fileToDataUrl(await (await fetch(url)).blob());
        } catch {
          this.notify('warn', t('save.embedFailed', { id: a.id }));
        }
      }
    }
    return serializeManual(this.manual, embed);
  }

  /** ダウンロードとして保存する */
  async saveDownload(): Promise<void> {
    const text = await this.serialize();
    downloadText(this.fileName, text);
    this.dirty = false;
    this.notify('info', this.embedImages ? t('save.doneEmbedded') : t('save.doneSeparate'));
  }

  /** File System Access API で保存する。開いたファイルがあれば上書き、無ければ保存先を選ぶ */
  async saveWithPicker(forcePick = false): Promise<void> {
    try {
      let handle = forcePick ? undefined : this.handle;
      handle ??= await pickSaveHandle(this.fileName);
      if (!handle) return;
      await writeToHandle(handle, await this.serialize());
      this.handle = handle;
      this.fileName = handle.name;
      this.dirty = false;
      this.notify('info', t('save.doneFile', { name: handle.name }));
    } catch (e) {
      this.notify('error', e instanceof Error ? e.message : String(e));
    }
  }

  /** 1 つの画像だけをファイルとして保存する（JSON と別に持つ画像を手元に残すため） */
  async downloadImage(assetId: string): Promise<void> {
    const url = this.images.get(assetId);
    const asset = this.manual.assets?.find((a) => a.id === assetId);
    if (!url || !asset) return;
    const blob = await (await fetch(url)).blob();
    downloadBlob(isDataUrl(asset.source.path) ? `${assetId}.${blob.type.split('/')[1] ?? 'png'}` : basename(asset.source.path), blob);
  }

  // ---- 下書き -------------------------------------------------------------

  restoreDraft(): void {
    const d = this.pendingDraft;
    if (!d) return;
    this.manual = d.manual;
    this.fileName = d.fileName;
    this.undoStack = [];
    this.redoStack = [];
    this.dirty = true;
    this.pendingDraft = undefined;
    this.images.clear();
    this.sizes.clear();
    this.selectTopic(this.manual.topics[0]?.id);
    this.notify('warn', t('draft.restoredNote'));
  }

  discardDraft(): void {
    clearDraft();
    this.pendingDraft = undefined;
  }

  /** 編集中の Manual を下書きとして保存する（保存先の localStorage が使えなければ何もしない） */
  autosave(): void {
    if (this.pendingDraft || !this.dirty) return;
    saveDraft(this.manual, this.fileName);
  }
}

export const editor = new EditorState();
