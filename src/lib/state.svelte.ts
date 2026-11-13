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
import { OpError, addAsset, addScreen, addTopic, newManual, scaleHotspots, updateAssetSource, updateScreen, uniquePath, type Added } from './ops';
import {
  canUseFilePicker,
  clearDraft,
  downloadBlob,
  downloadText,
  embeddedData,
  fileName,
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

/** 中央のステージの状態。edit は作図・選択、play は体験（player の ScreenFlow） */
export type Mode = 'edit' | 'play';
/** 下の引き出し。1 つだけ開く（E-6 素材、E-5 遷移の地図、E-7 検査） */
export type Drawer = 'assets' | 'map' | 'check';
/** 作図の道具 */
export type Tool = 'select' | 'rect' | 'circle' | 'poly' | 'pan';

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
  /** 素材を選んでいる（素材の引き出しで押したとき）。インスペクターが素材の欄を出す */
  assetId?: string;
  /** マニュアル自体（題名・版・適用範囲）を選んでいる */
  root?: boolean;
}

const HISTORY_LIMIT = 100;

class EditorState {
  manual = $state.raw<Manual>(newManual(crypto.randomUUID(), t('manual.untitled')));
  fileName = $state('manual.json');
  dirty = $state(false);
  mode = $state<Mode>('edit');
  drawer = $state<Drawer | undefined>(undefined);
  tool = $state<Tool>('select');
  /** 描き終えたときに 1 増やす。インスペクターが「ラベル」にフォーカスを移す合図 */
  focusLabel = $state(0);
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
    const assetId = s.assetId && this.manual.assets?.some((a) => a.id === s.assetId) ? s.assetId : undefined;
    const topic = this.manual.topics.find((x) => x.id === s.topicId) ?? this.manual.topics[0];
    let screen = topic?.screens?.find((x) => x.id === s.screenId);
    if (!screen && topic?.screens?.length)
      screen = topic.screens.find((x) => x.id === topic.startScreenRef) ?? topic.screens[0];
    const hotspot = screen?.hotspots.find((h) => h.id === s.hotspotId);
    this.selection = { topicId: topic?.id, screenId: screen?.id, hotspotId: hotspot?.id, stepId: s.stepId, assetId, root: s.root };
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

  /** 素材を選ぶ（インスペクターに素材の欄を出す）。中央のステージはそのままにしたいので、Topic と画面の選択は残す */
  selectAsset(assetId: string | undefined): void {
    const { topicId, screenId } = this.selection;
    this.selection = assetId ? { topicId, screenId, assetId } : { topicId, screenId };
  }

  /** マニュアル自体（題名・版・適用範囲）を選ぶ。Topic と画面の選択は残す */
  selectRoot(): void {
    const { topicId, screenId } = this.selection;
    this.selection = { topicId, screenId, root: true };
  }

  createTopic(kind: TopicKind): void {
    const id = this.apply((m) => addTopic(m, kind, t('topic.newTitle', { n: m.topics.length + 1 })));
    this.selectTopic(id);
    this.mode = 'edit';
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

  /**
   * 画像ファイルを素材 assetId の画像として割り当てる。読めた幅・高さは AssetFile.width / height に書く（model 0.2.0。
   * 値が同じなら Manual は変えない）。
   */
  async attachImage(assetId: string, file: Blob): Promise<boolean> {
    const url = URL.createObjectURL(file);
    const size = await measureImage(url);
    if (!size) {
      URL.revokeObjectURL(url);
      this.notify('error', t('image.unreadable'));
      return false;
    }
    this.setImage(assetId, url, size);
    const a = this.manual.assets?.find((x) => x.id === assetId);
    if (a && (a.source.width !== size.w || a.source.height !== size.h)) {
      this.apply((m) => updateAssetSource(m, assetId, { width: size.w, height: size.h }), `asset-size:${assetId}`);
    }
    return true;
  }

  /** 画像ファイルを素材として足す（画面は作らない）。足した素材の id を返す */
  async addAssetFromFile(file: File | Blob, name?: string): Promise<string | undefined> {
    const baseName = name ?? (file instanceof File ? file.name : `image-${Date.now()}.png`);
    if (!file.type.startsWith('image/')) {
      this.notify('warn', t('image.notImage', { name: baseName }));
      return undefined;
    }
    const url = URL.createObjectURL(file);
    const size = await measureImage(url);
    if (!size) {
      URL.revokeObjectURL(url);
      this.notify('error', t('image.unreadable'));
      return undefined;
    }
    const hash = await sha256Of(file);
    const assetId = this.apply((m) =>
      addAsset(m, { filename: baseName, mediaType: file.type, alt: baseName.replace(/\.[^.]+$/, ''), hash, width: size.w, height: size.h })
    );
    if (!assetId) {
      URL.revokeObjectURL(url);
      return undefined;
    }
    this.setImage(assetId, url, size);
    return assetId;
  }

  /** 複数の画像ファイルを素材として足す（ファイルの選択・フォルダーの一括追加・ドロップ） */
  async addAssets(files: File[]): Promise<string[]> {
    const ids: string[] = [];
    for (const f of files) {
      const id = await this.addAssetFromFile(f);
      if (id) ids.push(id);
    }
    if (ids.length > 0) this.notify('info', t('assets.added', { n: ids.length }));
    return ids;
  }

  /**
   * クリップボードの画像（スクリーンショット）を受け取る。画面の流れの Topic を選んでいれば新しい画面にし、
   * そうでなければ素材だけを足す。
   */
  async pasteImage(blob: Blob): Promise<void> {
    const ext = blob.type.split('/')[1]?.replace('jpeg', 'jpg') ?? 'png';
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, '').replace('T', '-');
    const name = `paste-${stamp}.${ext}`;
    const file = new File([blob], name, { type: blob.type });
    const topic = this.topic;
    if (topic?.kind === 'screenFlow' && this.mode === 'edit' && !this.selection.assetId && !this.selection.root) {
      if ((await this.addScreensFromFiles(topic.id, [file])) > 0) this.notify('info', t('assets.pastedScreen'));
    } else {
      const id = await this.addAssetFromFile(file);
      if (id) {
        this.drawer = 'assets';
        this.selectAsset(id);
        this.notify('info', t('assets.pastedAsset'));
      }
    }
  }

  /**
   * マスク: 塗りつぶした画像（PNG）で素材の画像を置き換える。元の画像は残さない（U-16）。
   * ファイル名は .png にし、hash・mediaType・幅・高さを更新し、埋め込んであった data URL は外す。
   */
  async maskAsset(assetId: string, masked: Blob): Promise<void> {
    const a = this.manual.assets?.find((x) => x.id === assetId);
    if (!a) return;
    const url = URL.createObjectURL(masked);
    const size = await measureImage(url);
    if (!size) {
      URL.revokeObjectURL(url);
      this.notify('error', t('image.unreadable'));
      return;
    }
    const hash = await sha256Of(masked);
    const currentPath = a.source.path !== undefined && !isDataUrl(a.source.path) ? a.source.path : undefined;
    const stem = (fileName(a.source) ?? assetId).replace(/\.[^.]+$/, '');
    const path = currentPath?.toLowerCase().endsWith('.png') ? currentPath : uniquePath(this.manual, `${stem}.png`);
    this.setImage(assetId, url, size);
    this.apply((m) => updateAssetSource(m, assetId, { path, mediaType: 'image/png', hash, width: size.w, height: size.h, data: null }));
    this.notify('info', t('assets.masked'));
  }

  /** 画像ファイルから素材と画面を作る（screenFlow の Topic に画面を足す）。足した画面の数を返す */
  async addScreensFromFiles(topicId: string, files: File[]): Promise<number> {
    let added = 0;
    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        this.notify('warn', t('image.notImage', { name: file.name }));
        continue;
      }
      const assetId = await this.addAssetFromFile(file);
      if (!assetId) continue;
      const screenId = this.apply((m) =>
        addScreen(m, topicId, assetId, t('screen.defaultCaption', { n: (m.topics.find((x) => x.id === topicId)?.screens?.length ?? 0) + 1 }))
      );
      if (screenId) {
        this.selection = { topicId, screenId };
        added++;
      }
    }
    return added;
  }

  /**
   * 画面の画像を差し替える。新しい画像の大きさが違うときは、ホットスポットの座標を縮尺で変換するかを尋ねる（「直す」工程）。
   * 素材は新しく作り、画面の assetRef を付け替える（元の素材は他の画面が使っているかもしれないので残す）。
   */
  async replaceScreenImage(topicId: string, screenId: string, file: File): Promise<void> {
    const screen = this.manual.topics.find((x) => x.id === topicId)?.screens?.find((s) => s.id === screenId);
    if (!screen) return;
    if (!file.type.startsWith('image/')) {
      this.notify('warn', t('image.notImage', { name: file.name }));
      return;
    }
    const before = this.sizes.get(screen.assetRef);
    const assetId = await this.addAssetFromFile(file);
    if (!assetId) return;
    const after = this.sizes.get(assetId);
    this.apply((m) => updateScreen(m, topicId, screenId, { assetRef: assetId }));
    if (before && after && (before.w !== after.w || before.h !== after.h) && screen.hotspots.length > 0) {
      if (confirm(t('screen.confirmScale', { w0: before.w, h0: before.h, w1: after.w, h1: after.h }))) {
        this.apply((m) => scaleHotspots(m, topicId, screenId, after.w / before.w, after.h / before.h));
      }
    }
  }

  /** 画像を決めずに画面を足す（遷移先を先に作るため）。素材は名前だけで、画像は後から差し替える */
  addBlankScreen(topicId: string, caption?: string): string | undefined {
    const n = (this.manual.topics.find((x) => x.id === topicId)?.screens?.length ?? 0) + 1;
    const assetId = this.apply((m) => addAsset(m, { filename: `screen-${n}.png`, mediaType: 'image/png' }));
    if (!assetId) return undefined;
    return this.apply((m) => addScreen(m, topicId, assetId, caption ?? t('screen.defaultCaption', { n })));
  }

  /** 複数の画像ファイルを、Asset.source.path のファイル名で照合して割り当てる。割り当てた件数を返す */
  async assignImagesByName(files: File[]): Promise<number> {
    let n = 0;
    for (const file of files) {
      const targets = (this.manual.assets ?? []).filter((a) => fileName(a.source) === file.name);
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
      // 画像が読めなくても、JSON に幅・高さがあれば座標の変換に使える
      if (a.source.width && a.source.height) this.sizes.set(a.id, { w: a.source.width, h: a.source.height });
      const data = embeddedData(a.source);
      const path = a.source.path;
      const url = data ?? (path !== undefined && baseUrl ? new URL(path, baseUrl).href : undefined);
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
    this.mode = 'edit';
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
    await this.openFromUrl(new URL(`${base}/examples/kenbaiki.manual.json`, location.href).href, 'kenbaiki.manual.json', t('open.exampleNote'));
  }

  /** URL の JSON を開く（同梱の例・ヘルプ）。画像は JSON の場所からの相対パスで読む */
  async openFromUrl(url: string, name: string, note?: string): Promise<void> {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await this.load(await res.text(), name, undefined, url);
      if (note) this.notify('info', note);
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
    this.mode = 'edit';
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

  /** 保存のたびに検査の結果を見て、エラーがあれば知らせる（保存は止めない。設計書 E-7） */
  private reportIssuesOnSave(): void {
    const n = this.validation.errors.length;
    if (n > 0) this.notify('warn', t('save.withErrors', { n }));
  }

  /** ダウンロードとして保存する */
  async saveDownload(): Promise<void> {
    const text = await this.serialize();
    downloadText(this.fileName, text);
    this.dirty = false;
    this.notify('info', this.embedImages ? t('save.doneEmbedded') : t('save.doneSeparate'));
    this.reportIssuesOnSave();
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
      this.reportIssuesOnSave();
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
    downloadBlob(fileName(asset.source) ?? `${assetId}.${blob.type.split('/')[1] ?? 'png'}`, blob);
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
