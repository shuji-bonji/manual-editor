<!-- 開く・保存する・新規・元に戻す。ファイルの読み書きは lib/io.ts とこの部品の中だけで行う -->
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
</script>

<header class="bar">
  <div class="title">
    <strong>{t('app.name')}</strong>
    <span class="badge">{t('app.prototype')}</span>
  </div>

  <div class="row" role="toolbar" aria-label={t('file.toolbar')}>
    <button class="btn" type="button" onclick={() => confirmDiscard() && editor.newDocument()} data-testid="new">{t('file.new')}</button>

    <input bind:this={openInput} class="sr-only" type="file" accept=".json,application/json" onchange={onOpen} data-testid="open-input" />
    <button class="btn" type="button" onclick={() => confirmDiscard() && openInput?.click()}>{t('file.open')}</button>
    {#if editor.canPick}
      <button class="btn" type="button" onclick={() => confirmDiscard() && editor.openWithPicker()}>{t('file.openPicker')}</button>
    {/if}
    <button class="btn" type="button" onclick={() => confirmDiscard() && editor.openExample()} data-testid="open-example">{t('file.example')}</button>

    <button class="btn primary" type="button" onclick={() => (editor.canPick ? editor.saveWithPicker() : editor.saveDownload())} data-testid="save">{t('file.save')}</button>
    {#if editor.canPick}
      <button class="btn" type="button" onclick={() => editor.saveWithPicker(true)}>{t('file.saveAs')}</button>
    {/if}
    <button class="btn" type="button" onclick={() => editor.saveDownload()} data-testid="download">{t('file.download')}</button>

    <button class="btn" type="button" disabled={!editor.canUndo} onclick={() => editor.undo()} data-testid="undo">{t('file.undo')}</button>
    <button class="btn" type="button" disabled={!editor.canRedo} onclick={() => editor.redo()}>{t('file.redo')}</button>
  </div>

  <div class="row status">
    <span class="muted small" data-testid="filename">{editor.fileName}{editor.dirty ? ' ●' : ''}</span>
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
    gap: 0.5rem 1rem;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem var(--gap);
    background: var(--surface);
    border-bottom: 1px solid var(--border);
  }
  .title {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
  .status {
    gap: 0.8rem;
  }
</style>
