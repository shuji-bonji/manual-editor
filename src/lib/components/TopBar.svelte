<!--
  E-0 の上の帯: 「ファイル」のメニュー（新規作成・開く・保存・HTML としてエクスポート・展開したフォルダーから取り込む）、元に戻す・やり直し、マニュアルの題名、
  「編集 | 体験」の切り替え、問題の件数（設計書 13.4 節）。
  ファイルの読み書きは lib/io.ts と state.svelte.ts にあり、ここは呼ぶだけ。
-->
<script lang="ts">
  import { editor } from '$lib/state.svelte';
  import { t } from '$lib/i18n';
  import HelpDialog from './HelpDialog.svelte';

  let helpOpen = $state(false);
  let menuOpen = $state(false);

  let openInput: HTMLInputElement | undefined = $state();
  let folderInput: HTMLInputElement | undefined = $state();
  let menuButton: HTMLButtonElement | undefined = $state();
  let menu: HTMLDivElement | undefined = $state();

  async function onOpen(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) await editor.openFile(file);
  }

  async function onImportFolder(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = '';
    if (files.length > 0) await editor.importFolder(files);
  }

  function confirmDiscard(): boolean {
    return !editor.dirty || confirm(t('file.confirmDiscard'));
  }

  /** メニューの項目を選んだら、メニューを閉じてから実行する */
  function run(action: () => unknown) {
    menuOpen = false;
    menuButton?.focus();
    void action();
  }

  const doNew = () => confirmDiscard() && editor.newDocument();
  const doOpen = () => confirmDiscard() && (editor.canPick ? editor.openWithPicker() : openInput?.click());
  const doImportFolder = () => confirmDiscard() && folderInput?.click();

  function onMenuKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      menuOpen = false;
      menuButton?.focus();
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = [...(menu?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    items[(at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
  }

  // メニューを開いたら先頭の項目にフォーカスを移し、外を押したら閉じる
  $effect(() => {
    if (!menuOpen) return;
    menu?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const outside = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!menu?.contains(target) && !menuButton?.contains(target)) menuOpen = false;
    };
    window.addEventListener('pointerdown', outside);
    return () => window.removeEventListener('pointerdown', outside);
  });

  const issueCount = $derived(editor.validation.errors.length + editor.validation.warnings.length);
</script>

<header class="bar">
  <div class="row files">
    <!-- ファイルを選ぶ欄は、メニューを閉じていても置いておく（File System Access API が無いブラウザーと、テストから使う） -->
    <input bind:this={openInput} class="sr-only" type="file" accept=".emanual,.zip" onchange={onOpen} data-testid="open-input" tabindex="-1" />
    <input bind:this={folderInput} class="sr-only" type="file" webkitdirectory onchange={onImportFolder} data-testid="import-folder-input" tabindex="-1" />
    <div class="menu-wrap">
      <button
        bind:this={menuButton}
        class="btn small"
        type="button"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onclick={() => (menuOpen = !menuOpen)}
        data-testid="file-menu"
      >
        {t('file.menu')} ▾
      </button>
      {#if menuOpen}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div bind:this={menu} class="menu" role="menu" aria-label={t('file.menu')} tabindex="-1" onkeydown={onMenuKey} data-testid="file-menu-list">
          <button type="button" role="menuitem" onclick={() => run(doNew)} data-testid="new">{t('file.new')}</button>
          <button type="button" role="menuitem" title={t('file.openHelp')} onclick={() => run(doOpen)} data-testid="open">{t('file.open')}</button>
          <hr />
          <button type="button" role="menuitem" title={t('file.saveHelp')} onclick={() => run(() => editor.save())} data-testid="save">{t('file.save')}</button>
          {#if editor.canPick}
            <button type="button" role="menuitem" onclick={() => run(() => editor.save(true))} data-testid="save-as">{t('file.saveAs')}</button>
          {/if}
          <hr />
          <button type="button" role="menuitem" title={t('file.exportHtmlHelp')} onclick={() => run(() => editor.exportHtml())} data-testid="export-html">{t('file.exportHtml')}</button>
          <button type="button" role="menuitem" title={t('file.importFolderHelp')} onclick={() => run(doImportFolder)} data-testid="import-folder">{t('file.importFolder')}</button>
        </div>
      {/if}
    </div>
    <span class="sep"></span>
    <div class="row" role="toolbar" aria-label={t('file.toolbar')}>
      <button class="btn small" type="button" disabled={!editor.canUndo} onclick={() => editor.undo()} data-testid="undo" title={t('file.undo')}>↶</button>
      <button class="btn small" type="button" disabled={!editor.canRedo} onclick={() => editor.redo()} title={t('file.redo')}>↷</button>
    </div>
  </div>

  <div class="title" title={editor.displayName}>
    <span class="dot" class:dirty={editor.dirty} aria-hidden="true">●</span>
    <strong>{editor.manual.title}</strong>
    <span class="muted small" data-testid="filename">{editor.displayName}{editor.dirty ? ' ●' : ''}</span>
  </div>

  <div class="row right">
    <div class="mode" role="group" aria-label={t('mode.label')}>
      <button type="button" class:on={editor.mode === 'edit'} aria-pressed={editor.mode === 'edit'} onclick={() => (editor.mode = 'edit')} data-testid="mode-edit">{t('mode.edit')}</button>
      <button type="button" class:on={editor.mode === 'play'} aria-pressed={editor.mode === 'play'} onclick={() => (editor.mode = 'play')} data-testid="mode-play">{t('mode.play')}</button>
    </div>
    <button
      type="button"
      class="btn small issues"
      class:err={editor.validation.errors.length > 0}
      class:warn={editor.validation.errors.length === 0 && editor.validation.warnings.length > 0}
      onclick={() => (editor.drawer = editor.drawer === 'check' ? undefined : 'check')}
      data-testid="issues"
    >
      {issueCount > 0 ? `⚠ ${t('issues.count', { n: issueCount })}` : t('issues.none')}
    </button>
    <button type="button" class="btn small" onclick={() => (helpOpen = true)} data-testid="help">{t('help.button')}</button>
  </div>
</header>
{#if helpOpen}
  <HelpDialog onclose={() => (helpOpen = false)} />
{/if}

<style>
  .bar {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem 1rem;
    align-items: center;
    padding: 0.4rem var(--gap);
    background: var(--surface);
    border-bottom: 1px solid var(--border);
  }
  .files {
    gap: 0.3rem;
  }
  .menu-wrap {
    position: relative;
  }
  .menu {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    z-index: 20;
    min-width: 13rem;
    display: flex;
    flex-direction: column;
    padding: 0.25rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: 0 6px 20px rgb(0 0 0 / 0.18);
  }
  .menu button {
    font: inherit;
    font-size: 0.9rem;
    color: inherit;
    text-align: left;
    background: none;
    border: none;
    border-radius: calc(var(--radius) - 2px);
    padding: 0.4rem 0.7rem;
    cursor: pointer;
  }
  .menu button:hover,
  .menu button:focus-visible {
    background: var(--accent);
    color: var(--accent-text);
    outline: none;
  }
  .menu hr {
    width: 100%;
    border: none;
    border-top: 1px solid var(--border);
    margin: 0.25rem 0;
  }
  .sep {
    width: 1px;
    height: 1.4rem;
    background: var(--border);
    margin: 0 0.3rem;
  }
  .title {
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
    min-width: 0;
    flex: 1;
  }
  .title strong {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .dot {
    color: var(--border);
    font-size: 0.7rem;
  }
  .dot.dirty {
    color: var(--warn);
  }
  .right {
    gap: 0.8rem;
    margin-left: auto;
  }
  .mode {
    display: flex;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }
  .mode button {
    font: inherit;
    font-size: 0.85rem;
    color: inherit;
    background: var(--surface);
    border: none;
    padding: 0.3rem 0.9rem;
    cursor: pointer;
  }
  .mode button.on {
    background: var(--accent);
    color: var(--accent-text);
    font-weight: 600;
  }
  .issues.err {
    color: var(--danger);
    border-color: var(--danger);
  }
  .issues.warn {
    color: var(--warn);
    border-color: var(--warn);
  }
</style>
