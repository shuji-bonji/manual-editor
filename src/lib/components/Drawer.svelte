<!--
  E-0 の下の引き出し: 素材・適用範囲（LibraryPanel）、遷移の地図（次の版）、検査（IssuesPanel）。1 つだけ開く。
  高さは右下の角をドラッグして変えられる（CSS の resize）。
-->
<script lang="ts">
  import { editor, type Drawer } from '$lib/state.svelte';
  import { t } from '$lib/i18n';
  import LibraryPanel from './LibraryPanel.svelte';
  import IssuesPanel from './IssuesPanel.svelte';

  const tabs: Drawer[] = ['library', 'map', 'check'];
  const issueCount = $derived(editor.validation.errors.length + editor.validation.warnings.length);

  function toggle(tab: Drawer) {
    editor.drawer = editor.drawer === tab ? undefined : tab;
  }
</script>

<section class="drawer" class:open={editor.drawer !== undefined} aria-label={t('drawer.check')}>
  <div class="tabs" role="tablist">
    {#each tabs as tab (tab)}
      <button type="button" role="tab" aria-selected={editor.drawer === tab} onclick={() => toggle(tab)} data-testid="drawer-{tab}">
        {editor.drawer === tab ? '▾' : '▸'}
        {t(`drawer.${tab}`)}
        {#if tab === 'check' && issueCount > 0}<span class="badge" class:err={editor.validation.errors.length > 0} class:warn={editor.validation.errors.length === 0}>{issueCount}</span>{/if}
      </button>
    {/each}
    {#if editor.drawer}
      <button type="button" class="close" onclick={() => (editor.drawer = undefined)} aria-label={t('drawer.close')}>×</button>
    {/if}
  </div>
  {#if editor.drawer}
    <div class="body" role="tabpanel">
      {#if editor.drawer === 'library'}
        <LibraryPanel />
      {:else if editor.drawer === 'check'}
        <IssuesPanel />
      {:else}
        <p class="muted small">{t('drawer.mapNotYet')}</p>
      {/if}
    </div>
  {/if}
</section>

<style>
  .drawer {
    border-top: 1px solid var(--border);
    background: var(--surface);
  }
  .tabs {
    display: flex;
    gap: 0.25rem;
    padding: 0.25rem var(--gap);
    align-items: center;
  }
  .tabs button[role='tab'] {
    font: inherit;
    font-size: 0.85rem;
    color: inherit;
    background: none;
    border: none;
    padding: 0.3rem 0.6rem;
    border-radius: var(--radius);
    cursor: pointer;
    display: inline-flex;
    gap: 0.3rem;
    align-items: center;
  }
  .tabs button[aria-selected='true'] {
    background: var(--surface-2);
    font-weight: 600;
  }
  .close {
    margin-left: auto;
    font: inherit;
    color: var(--muted);
    background: none;
    border: none;
    cursor: pointer;
    padding: 0 0.5rem;
  }
  .body {
    height: 40vh;
    min-height: 8rem;
    max-height: 80vh;
    overflow: auto;
    resize: vertical;
    padding: 0.5rem var(--gap) var(--gap);
    border-top: 1px solid var(--border);
  }
</style>
