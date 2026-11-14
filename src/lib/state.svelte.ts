/**
 * 画面全体で共有する状態。Manual（manual-model の型）を 1 つ持ち、編集は ops.ts の純粋な関数を通して行う。
 *
 * - manual は `$state.raw`。ops.ts が毎回新しい Manual を返すので、深い監視（Proxy）は要らない。
 *   Proxy にすると structuredClone が使えなくなるため、raw にしている。
 * - 編集中の 1 冊は作業場所（workspace.ts。ブラウザーの中のフォルダー）に置く。manual.json は編集のたびに、
 *   画像は取り込んだ時点で書くので、タブを閉じても続きから始められる（設計書 13 節）。
 * - 画像の表示には、作業場所から読んだ Blob の object URL（images）を使う。Manual に入るのは
 *   Asset.source.path（manual.json からの相対パス。新しく取り込む画像は assets/ の下）だけ。
 * - 元に戻す・やり直しは、Manual の履歴（最大 100 件）で行う。同じ欄への連続した入力は 1 回にまとめる。
 */
import { SvelteMap } from 'svelte/reactivity';
import { validateManual, type Manual, type TopicKind } from '@shuji-bonji/experiential-manual-model';
import { base } from '$app/paths';
import { OpError, addAsset, addScreen, addTopic, newManual, scaleHotspots, updateAssetSource, updateScreen, uniquePath, type Added } from './ops';
import {
  canUseFilePicker,
  downloadBlob,
  embeddedData,
  fileName,
  fileToDataUrl,
  isDataUrl,
  measureImage,
  parseManualText,
  pickOpenFile,
  pickSaveHandle,
  serializeManual,
  sha256Of,
  writeToHandle,
  type FileHandle
} from './io';
import {
  assetPath,
  clearSession,
  isStorablePath,
  loadSession,
  memoryStore,
  openWorkspace,
  requestPersistence,
  saveSession,
  type Session,
  type WorkspaceStore
} from './workspace';
import { buildBundle, bundleNameFrom, checkBundle, normalizeAssetPaths, referencedPaths, splitBundle, suggestedBundleName } from './bundle';
import { looksLikeZip, unzip } from './zip';
import { buildExportHtml, suggestedHtmlName } from './export-html';
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
  /** しばらくすると自動で消えるか（「保存しました」のような、確かめる必要のない知らせ） */
  auto: boolean;
}

/** 自動で消える知らせを出しておく時間 */
export const NOTICE_MS = 5000;

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
  /** 保存先の zip の名前。まだ保存も開いてもいなければ空（そのときは題名から作った案を出す） */
  fileName = $state('');
  dirty = $state(false);
  mode = $state<Mode>('edit');
  drawer = $state<Drawer | undefined>(undefined);
  tool = $state<Tool>('select');
  /** 描き終えたときに 1 増やす。インスペクターが「ラベル」にフォーカスを移す合図 */
  focusLabel = $state(0);
  selection = $state<Selection>({});
  notices = $state.raw<Notice[]>([]);
  canPick = $state(false);
  /** 作業場所が再読み込みの後も残るか。false のときは、閉じる前に確認を出す */
  persistent = $state(false);

  /** 素材 id → 表示用の URL（object URL・data URL・同梱サンプルの URL） */
  images = new SvelteMap<string, string>();
  /** 素材 id → 画像の元の大きさ（画素） */
  sizes = new SvelteMap<string, { w: number; h: number }>();

  validation = $derived(validateManual(this.manual));
  topic = $derived(this.manual.topics.find((x) => x.id === this.selection.topicId));
  /** 上の帯に出すファイル名（保存先が決まっていなければ、題名から作った案） */
  displayName = $derived(this.fileName || suggestedBundleName(this.manual.title));

  private undoStack: Manual[] = [];
  private redoStack: Manual[] = [];
  private lastCoalesce: string | undefined;
  /** 上書き保存する先（File System Access API で開いた・保存した zip）。再読み込みすると失う */
  private handle: FileHandle | undefined;
  /** handle のファイルを、最後に読んだ・書いた時点の更新時刻。保存の前に、外で書き換えられていないかを確かめる */
  private handleStamp: number | undefined;
  private noticeSeq = 0;
  private noticeTimers = new Map<number, ReturnType<typeof setTimeout>>();
  private blobUrls = new Set<string>();
  /** 作業場所。init() で OPFS に差し替える（使えなければメモリーのまま） */
  private ws: WorkspaceStore = memoryStore();
  /** 作業場所の中の、この 1 冊のフォルダー名。Manual.id とは別に持つ（同じ id の JSON を開き直しても混ざらないように） */
  private bookId: string = crypto.randomUUID();
  /** 作業場所への書き込みを 1 つずつ順に行うための列 */
  private writes: Promise<void> = Promise.resolve();
  private writeFailed = false;
  private persistenceAsked = false;

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** ブラウザーで起動したあとに 1 回呼ぶ（作業場所を開き、前回の続きがあれば読み込む） */
  async init(): Promise<void> {
    this.canPick = canUseFilePicker();
    this.ws = await openWorkspace();
    this.persistent = this.ws.persistent;
    if (!this.persistent) this.notify('warn', t('workspace.notPersistent'));
    const session = loadSession();
    if (session) await this.resume(session);
  }

  // ---- 作業場所 -------------------------------------------------------------

  /** 作業場所への書き込みを順番に行う。失敗は 1 回だけ知らせ、編集は続けられるようにする */
  private enqueue(job: () => Promise<void>): Promise<void> {
    this.writes = this.writes.then(job).then(
      () => {
        this.writeFailed = false;
      },
      (e) => {
        if (!this.writeFailed) this.notify('error', t('workspace.writeFailed', { reason: e instanceof Error ? e.message : String(e) }));
        this.writeFailed = true;
      }
    );
    return this.writes;
  }

  /** どの 1 冊を開いているかを覚える（次に開いたときの続き） */
  private remember(): void {
    saveSession({ bookId: this.bookId, fileName: this.fileName, dirty: this.dirty });
  }

  /** いまの Manual を作業場所の manual.json に書く */
  private persistManual(): Promise<void> {
    const bookId = this.bookId;
    const text = serializeManual(this.manual);
    this.remember();
    return this.enqueue(() => this.ws.writeManual(bookId, text));
  }

  /** 画像を作業場所にコピーする。path が作業場所に置けない形（URL など）なら何もしない */
  private storeImage(path: string | undefined, data: Blob): Promise<void> {
    if (!isStorablePath(path)) return Promise.resolve();
    const bookId = this.bookId;
    if (!this.persistenceAsked && this.persistent) {
      this.persistenceAsked = true;
      void requestPersistence();
    }
    return this.enqueue(() => this.ws.writeFile(bookId, path, data));
  }

  /**
   * 別の 1 冊に切り替える前に呼ぶ。いまの 1 冊を作業場所から消し、新しいフォルダー名を決める。
   * 作業場所に複数の冊を残して一覧から選ぶ形（ダッシュボード）は後の版で作る。それまでは、開いている 1 冊だけを持つ。
   */
  private startNewBook(): void {
    const old = this.bookId;
    this.bookId = crypto.randomUUID();
    void this.enqueue(() => this.ws.removeBook(old));
  }

  /** 前回開いていた 1 冊を、作業場所から読み込む。読めなければ新規のまま始める */
  private async resume(session: Session): Promise<void> {
    try {
      const text = await this.ws.readManual(session.bookId);
      if (text === undefined) {
        clearSession();
        return;
      }
      const { manual } = parseManualText(text);
      this.bookId = session.bookId;
      this.manual = manual;
      this.fileName = session.fileName;
      // 上書きの先（handle）は再読み込みで失うので、保存するときは保存先を選び直す
      this.dirty = session.dirty;
      this.undoStack = [];
      this.redoStack = [];
      this.lastCoalesce = undefined;
      this.handle = undefined;
      this.selectTopic(this.manual.topics[0]?.id);
      await this.resolveImages(this.manual);
    } catch (e) {
      this.notify('error', t('workspace.resumeFailed', { reason: e instanceof Error ? e.message : String(e) }));
    }
  }

  // ---- 通知 ---------------------------------------------------------------

  /**
   * 知らせを出す。info は 5 秒後に自動で消える（画面の隅に重ねて出すので、消えても画面の配置は動かない）。
   * warn と error、および sticky を付けた info は、「閉じる」を押すまで残る。
   */
  notify(kind: Notice['kind'], text: string, options: { sticky?: boolean } = {}): void {
    const id = ++this.noticeSeq;
    const auto = kind === 'info' && !options.sticky;
    this.notices = [...this.notices, { id, kind, text, auto }];
    if (auto) this.resumeNotice(id);
  }
  dismiss(id: number): void {
    this.holdNotice(id);
    this.notices = this.notices.filter((n) => n.id !== id);
  }
  /** 自動で消えるのを止める（知らせにマウスを載せている・フォーカスがある間） */
  holdNotice(id: number): void {
    const timer = this.noticeTimers.get(id);
    if (timer !== undefined) clearTimeout(timer);
    this.noticeTimers.delete(id);
  }
  /** 自動で消えるまでの時間を、最初から数え直す */
  resumeNotice(id: number): void {
    this.holdNotice(id);
    if (!this.notices.some((n) => n.id === id && n.auto)) return;
    this.noticeTimers.set(
      id,
      setTimeout(() => this.dismiss(id), NOTICE_MS)
    );
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
    await this.storeImage(a?.source.path, file);
    return true;
  }

  /** 画像ファイルを素材として足す（画面は作らない）。画像は作業場所の assets/ にコピーする。足した素材の id を返す */
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
      addAsset(m, { filename: assetPath(baseName), mediaType: file.type, alt: baseName.replace(/\.[^.]+$/, ''), hash, width: size.w, height: size.h })
    );
    if (!assetId) {
      URL.revokeObjectURL(url);
      return undefined;
    }
    this.setImage(assetId, url, size);
    await this.storeImage(this.manual.assets?.find((a) => a.id === assetId)?.source.path, file);
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
   * マスク: 塗りつぶした画像（PNG）で素材の画像を置き換える。元の画像は残さない（U-16。作業場所からも消す）。
   * ファイル名は .png にし（フォルダーはそのまま）、hash・mediaType・幅・高さを更新し、埋め込んであった data URL は外す。
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
    const renamed = currentPath ? currentPath.replace(/\.[^./\\]+$/, '') + '.png' : assetPath(`${assetId}.png`);
    const path = currentPath?.toLowerCase().endsWith('.png') ? currentPath : uniquePath(this.manual, renamed);
    this.setImage(assetId, url, size);
    this.apply((m) => updateAssetSource(m, assetId, { path, mediaType: 'image/png', hash, width: size.w, height: size.h, data: null }));
    if (currentPath && currentPath !== path && isStorablePath(currentPath)) {
      const bookId = this.bookId;
      void this.enqueue(() => this.ws.removeFile(bookId, currentPath));
    }
    await this.storeImage(path, masked);
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
    const assetId = this.apply((m) => addAsset(m, { filename: assetPath(`screen-${n}.png`), mediaType: 'image/png' }));
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

  /**
   * 読み込んだ Manual の素材の画像を用意する。
   * - data URL が埋め込まれていれば、それをそのまま使う（manual.json に入っているので、作業場所にも残る）。
   * - 作業場所にファイルがあれば、それを読む（前回の続き）。
   * - baseUrl があれば、相対パスの画像を取りに行き、作業場所にコピーする（同梱の例・ヘルプ）。
   *   path を assets/ の下に揃えたときは、sourcePath が元の相対パスを返す。
   */
  private async resolveImages(manual: Manual, baseUrl?: string, sourcePath: (path: string) => string = (p) => p): Promise<void> {
    for (const url of this.blobUrls) URL.revokeObjectURL(url);
    this.blobUrls.clear();
    this.images.clear();
    this.sizes.clear();
    const bookId = this.bookId;
    for (const a of manual.assets ?? []) {
      if (a.kind !== 'image') continue;
      // 画像が読めなくても、JSON に幅・高さがあれば座標の変換に使える
      if (a.source.width && a.source.height) this.sizes.set(a.id, { w: a.source.width, h: a.source.height });
      const path = a.source.path;
      let url = embeddedData(a.source);
      if (!url && isStorablePath(path)) {
        let blob: Blob | undefined;
        try {
          blob = await this.ws.readFile(bookId, path);
          if (!blob && baseUrl) {
            const res = await fetch(new URL(sourcePath(path), baseUrl).href);
            if (res.ok) {
              blob = await res.blob();
              await this.storeImage(path, blob);
            }
          }
        } catch {
          blob = undefined;
        }
        if (blob) url = URL.createObjectURL(blob);
      }
      if (!url) continue;
      const size = await measureImage(url);
      if (size) this.setImage(a.id, url, size);
      else if (url.startsWith('blob:')) URL.revokeObjectURL(url);
    }
  }

  // ---- 開く・保存する --------------------------------------------------------

  /**
   * Manual の JSON を読み込んで、新しい 1 冊として開く。
   * - files は、manual.json からの相対パスにした画像など。作業場所へコピーする。
   * - strict（マニュアルのファイルを開いたとき）は、2021 年の JSON を受け付けず、path も変えない。
   *   それ以外（取り込み・同梱の例）は、素材の path を assets/ の下に揃える（保存するファイルの構成を保つため）。
   */
  private async load(
    text: string,
    name: string,
    from: { handle?: FileHandle; baseUrl?: string; files?: { path: string; data: Blob }[]; strict?: boolean; imported?: boolean } = {}
  ): Promise<void> {
    const parsed = parseManualText(text, {
      newId: () => crypto.randomUUID(),
      title: name.replace(/\.(emanual|manual\.zip|manual\.json|zip|json)$/i, '')
    });
    if (from.strict && parsed.kind === 'legacy') throw new Error(t('open.notEmanual'));
    const { manual, moves } = from.strict ? { manual: parsed.manual, moves: [] } : normalizeAssetPaths(parsed.manual);
    const movedTo = new Map(moves.map((m) => [m.from, m.to]));
    const movedFrom = new Map(moves.map((m) => [m.to, m.from]));

    this.startNewBook();
    this.manual = manual;
    this.undoStack = [];
    this.redoStack = [];
    this.lastCoalesce = undefined;
    this.handle = from.handle;
    this.handleStamp = undefined;
    this.fileName = bundleNameFrom(name);
    // マニュアルのファイルを開いた直後は、そのファイルと同じ中身。取り込んだもの（フォルダー・2021 年の JSON）は、まだ保存していない
    this.dirty = parsed.kind === 'legacy' || from.imported === true;
    this.notices = [];
    if (parsed.kind === 'legacy') {
      this.notify('info', t('open.legacy'), { sticky: true });
      for (const w of parsed.warnings) this.notify('warn', w);
    }
    this.selectTopic(this.manual.topics[0]?.id);
    this.mode = 'edit';
    void this.persistManual();
    // 取り込みでは、Manual が指しているファイルだけをコピーする（フォルダーにある関係のないファイルは持ち込まない）
    const wanted = new Set(referencedPaths(parsed.manual));
    for (const f of from.files ?? []) {
      if (from.strict || wanted.has(f.path)) await this.storeImage(movedTo.get(f.path) ?? f.path, f.data);
    }
    await this.resolveImages(this.manual, from.baseUrl, (path) => movedFrom.get(path) ?? path);
    const missing = (this.manual.assets ?? []).filter((a) => a.kind === 'image' && !this.images.has(a.id)).length;
    if (missing > 0) this.notify('warn', t('open.missingImages', { n: missing }));
  }

  /**
   * マニュアルのファイル（.emanual）を開く。zip であることと、中が manual.json ＋ assets/ の構成であることを確かめ、
   * 違えば理由を出して開かない（設計書 13.4 節）。
   */
  private async openEmanual(file: File, handle?: FileHandle): Promise<void> {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!looksLikeZip(bytes)) throw new Error(t('open.notEmanual'));
    const check = checkBundle(await unzip(bytes));
    if (!check.ok) {
      if (check.reason === 'no-manual') throw new Error(t('open.noManualInFile'));
      const names = check.paths.slice(0, 3).join('、') + (check.paths.length > 3 ? ' …' : '');
      throw new Error(t('open.unexpected', { n: check.paths.length, names }));
    }
    const { manual, files } = check.parts;
    await this.load(new TextDecoder().decode(manual.data), file.name, {
      handle,
      strict: true,
      files: files.map((f) => ({ path: f.path, data: new Blob([f.data as BlobPart]) }))
    });
    if (handle) this.handleStamp = file.lastModified;
  }

  /** <input type="file"> で選ばれたマニュアルのファイルを開く */
  async openFile(file: File): Promise<void> {
    try {
      await this.openEmanual(file);
    } catch (e) {
      this.notify('error', e instanceof Error ? e.message : String(e));
    }
  }

  /** File System Access API で開く（保存のときに同じファイルへ上書きできる） */
  async openWithPicker(): Promise<void> {
    try {
      const r = await pickOpenFile();
      if (r) await this.openEmanual(r.file, r.handle);
    } catch (e) {
      this.notify('error', e instanceof Error ? e.message : String(e));
    }
  }

  /**
   * 展開したフォルダーから取り込む（<input type="file" webkitdirectory> で選ばれたファイルの一覧）。
   * マニュアルのファイルを展開して手で直したフォルダー、スクリプトが書き出したフォルダー、2021 年の JSON のフォルダーを読む。
   * manual の JSON と、そこから相対パスで指す画像を作業場所にコピーし、画像の path は assets/ の下に揃える。
   * 読むだけで、フォルダーには書き戻さない。
   */
  async importFolder(files: File[]): Promise<void> {
    try {
      const entries = files.map((f) => ({ path: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name, data: f }));
      const parts = splitBundle(entries);
      if (!parts) throw new Error(t('open.noManual'));
      const folder = parts.manual.path.split('/').slice(-2, -1)[0];
      const base = parts.manual.path.split('/').pop() ?? 'manual.json';
      await this.load(await parts.manual.data.text(), base === 'manual.json' && folder ? folder : base, { files: parts.files, imported: true });
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
      await this.load(await res.text(), name, { baseUrl: url });
      if (note) this.notify('info', note);
    } catch (e) {
      this.notify('error', t('open.exampleFailed', { reason: e instanceof Error ? e.message : String(e) }));
    }
  }

  newDocument(): void {
    this.startNewBook();
    this.manual = newManual(crypto.randomUUID(), t('manual.untitled'));
    this.undoStack = [];
    this.redoStack = [];
    this.lastCoalesce = undefined;
    this.handle = undefined;
    this.handleStamp = undefined;
    this.fileName = '';
    this.dirty = false;
    this.notices = [];
    for (const url of this.blobUrls) URL.revokeObjectURL(url);
    this.blobUrls.clear();
    this.images.clear();
    this.sizes.clear();
    this.selection = {};
    this.mode = 'edit';
    void this.persistManual();
  }

  /**
   * いまの 1 冊を、マニュアルのファイル（zip）にする。入れるのは manual.json と、Manual が指している画像（作業場所にあるもの）。
   * 画像が作業場所に無い素材（JSON 単体を開いて、まだ割り当てていないもの）は入れず、件数を知らせる。
   */
  private async bundle(): Promise<Blob> {
    await this.writes;
    const bookId = this.bookId;
    const { zip, missing } = await buildBundle(this.manual, serializeManual(this.manual), async (path) => {
      const blob = await this.ws.readFile(bookId, path);
      return blob ? new Uint8Array(await blob.arrayBuffer()) : undefined;
    });
    if (missing.length > 0) this.notify('warn', t('save.missingImages', { n: missing.length }));
    return new Blob([zip as BlobPart], { type: 'application/zip' });
  }

  /** 保存した後の始末（検査の結果を知らせる。エラーがあっても保存は止めない。設計書 E-7） */
  private afterSave(name: string, downloaded: boolean): void {
    this.fileName = name;
    this.dirty = false;
    this.remember();
    this.notify('info', t(downloaded ? 'save.doneDownload' : 'save.doneFile', { name }));
    const n = this.validation.errors.length;
    if (n > 0) this.notify('warn', t('save.withErrors', { n }));
  }

  /**
   * 保存する。1 冊をマニュアルのファイル（.emanual。manual.json ＋ assets/ の zip）にして書き出す。
   * File System Access API があれば、開いた・前に保存した zip に上書きし、無ければ保存先を選ぶ（saveAs なら必ず選ぶ）。
   * API が無いブラウザーでは、ダウンロードになる。
   */
  async save(saveAs = false): Promise<void> {
    try {
      const name = this.displayName;
      if (!this.canPick) {
        downloadBlob(name, await this.bundle());
        this.afterSave(name, true);
        return;
      }
      let handle = saveAs ? undefined : this.handle;
      if (handle && this.handleStamp !== undefined) {
        // 開いた後に、ほかの道具やクラウドの同期でファイルが書き換えられていたら、上書きの前に尋ねる
        const now = (await handle.getFile()).lastModified;
        if (now !== this.handleStamp && !confirm(t('save.confirmOverwrite', { name: handle.name }))) return;
      }
      handle ??= await pickSaveHandle(name);
      if (!handle) return;
      await writeToHandle(handle, await this.bundle());
      this.handle = handle;
      this.handleStamp = (await handle.getFile()).lastModified;
      this.afterSave(handle.name, false);
    } catch (e) {
      this.notify('error', e instanceof Error ? e.message : String(e));
    }
  }

  /**
   * 単一の HTML としてエクスポートする（簡易の配布。設計書 13.11 節）。
   * 閲覧部品とマニュアルの中身（画像は data URL）を 1 つの HTML に埋め込む。ダブルクリックで開いて見られる。
   * 保存とは別のもので、保存先（.emanual）や「未保存」の印は変えない。
   */
  async exportHtml(): Promise<void> {
    try {
      await this.writes;
      const bookId = this.bookId;
      const embed: Record<string, string> = {};
      let missing = 0;
      for (const a of this.manual.assets ?? []) {
        if (a.kind !== 'image' || embeddedData(a.source)) continue;
        const blob = isStorablePath(a.source.path) ? await this.ws.readFile(bookId, a.source.path) : undefined;
        if (blob) embed[a.id] = await fileToDataUrl(blob.type ? blob : new Blob([blob], { type: a.source.mediaType ?? 'image/png' }));
        else missing++;
      }
      // 閲覧部品（モジュールでない形のビルド）は大きいので、エクスポートするときに初めて読み込む
      const { default: playerScript } = await import('@shuji-bonji/experiential-manual-player/element.iife?raw');
      const manual = JSON.parse(serializeManual(this.manual, embed)) as Manual;
      const html = new Blob([buildExportHtml({ manual, playerScript })], { type: 'text/html' });
      const name = suggestedHtmlName(this.manual.title);
      if (this.canPick) {
        const handle = await pickSaveHandle(name, 'html');
        if (!handle) return;
        await writeToHandle(handle, html);
        this.notify('info', t('export.doneFile', { name: handle.name }));
      } else {
        downloadBlob(name, html);
        this.notify('info', t('export.doneDownload', { name }));
      }
      if (missing > 0) this.notify('warn', t('export.missingImages', { n: missing }));
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

  // ---- 自動保存 -----------------------------------------------------------

  /** 編集中の Manual を作業場所に書く（+page.svelte が、編集のたびに少し待ってから呼ぶ） */
  autosave(): void {
    void this.persistManual();
  }
}

export const editor = new EditorState();
