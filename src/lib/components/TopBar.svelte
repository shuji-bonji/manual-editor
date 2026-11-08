<!--
  E-0 の上の帯: ファイル操作、元に戻す・やり直し、マニュアルの題名、「編集 | 体験」の切り替え、問題の件数。
  ファイルの読み書きは lib/io.ts と state.svelte.ts にあり、ここは呼ぶだけ。
-->
<script lang="ts">
  import { editor } from '$lib/state.svelte';
  import { t } from '$lib/i18n';

  let openInput: HTMLInputElement | undefined = $state();

  async function onOpen(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) await editor.openFile(file);
  }

  function confirmDiscard(): boolean {
    return !editor.dirty || confirm(t('file.confirmDiscard'));
  }

  const issueCount = $derived(editor.validation.errors.length + editor.validation.warnings.length);
</script>

<header class="bar">
  <div class="row files" role="toolbar" aria-label={t('file.toolbar')}>
    <button class="btn small" type="button" onclick={() => confirmDiscard() && editor.newDocument()} data-testid="new">{t('file.new')}</button>
    <input bind:this={openInput} class="sr-only" type="file" accept=".json,application/json" onchange={onOpen} data-testid="open-input" />
    <button class="btn small" type="button" onclick={() => confirmDiscard() && openInput?.click()}>{t('file.open')}</button>
    {#if editor.canPick}
      <button class="btn small" type="button" onclick={() => confirmDiscard() && editor.openWithPicker()}>{t('file.openPicker')}</button>
    {/if}
    <button class="btn small" type="button" onclick={() => confirmDiscard() && editor.openExample()} data-testid="open-example">{t('file.example')}</button>
    <button class="btn small primary" type="button" onclick={() => (editor.canPick ? editor.saveWithPicker() : editor.saveDownload())} data-testid="save">{t('file.save')}</button>
    {#if editor.canPick}
      <button class="btn small" type="button" onclick={() => editor.saveWithPicker(true)}>{t('file.saveAs')}</button>
    {/if}
    <button class="btn small" type="button" onclick={() => editor.saveDownload()} data-testid="download">{t('file.download')}</button>
    <span class="sep"></span>
    <button class="btn small" type="button" disabled={!editor.canUndo} onclick={() => editor.undo()} data-testid="undo" title={t('file.undo')}>↶</button>
    <button class="btn small" type="button" disabled={!editor.canRedo} onclick={() => editor.redo()} title={t('file.redo')}>↷</button>
  </div>

  <div class="title" title={editor.fileName}>
    <span class="dot" class:dirty={editor.dirty} aria-hidden="true">●</span>
    <strong>{editor.manual.title}</strong>
    <span class="muted small" data-testid="filename">{editor.fileName}{editor.dirty ? ' ●' : ''}</span>
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
    <label class="row small" title={t('file.embedHelp')}>
      <input type="checkbox" bind:checked={editor.embedImages} />
      {t('file.embed')}
    </label>
  </div>
</header>

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
