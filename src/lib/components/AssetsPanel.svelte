<!--
  E-6 素材（下の引き出し）: Manual.assets をサムネイルで一覧にし、使っている画面・手順の数と、使われていないもの・画像が無いものを出す。
  追加はファイルの選択、フォルダーの一括追加、この引き出しへのドロップ、クリップボードからの貼り付け（+page.svelte が受けて editor.pasteImage を呼ぶ）。
  カードを押すと素材を選び、インスペクターに素材の欄（代替テキスト・出典・使っている場所・マスク・差し替え）が出る。
  画像の幅・高さは追加時に読んで AssetFile.width / height に書く（state.svelte.ts の addAssetFromFile / attachImage）。
-->
<script lang="ts">
  import { editor } from '$lib/state.svelte';
  import { assetUsage, removeUnusedAssets } from '$lib/ops';
  import { embeddedData, fileName } from '$lib/io';
  import { t } from '$lib/i18n';

  type Filter = 'all' | 'unused' | 'missing';
  let filter = $state<Filter>('all');
  let dragging = $state(false);
  let fileInput: HTMLInputElement | undefined = $state();
  let folderInput: HTMLInputElement | undefined = $state();
  let bulkInput: HTMLInputElement | undefined = $state();

  const m = $derived(editor.manual);
  const assets = $derived(m.assets ?? []);
  const usage = $derived(assetUsage(m));
  const unusedCount = $derived(assets.filter((a) => !usage.has(a.id)).length);
  const missingCount = $derived(assets.filter((a) => a.kind === 'image' && !editor.images.get(a.id)).length);
  const shown = $derived(
    assets.filter((a) => (filter === 'unused' ? !usage.has(a.id) : filter === 'missing' ? a.kind === 'image' && !editor.images.get(a.id) : true))
  );

  function usageCount(id: string): number {
    const u = usage.get(id);
    return u ? u.screens.length + u.steps.length + u.blocks.length : 0;
  }

  async function onPick(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const files = [...(input.files ?? [])].filter((f) => f.type.startsWith('image/'));
    input.value = '';
    if (files.length) await editor.addAssets(files);
  }

  async function onBulk(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = '';
    await editor.assignImagesByName(files);
  }

  function onDragOver(e: DragEvent) {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    dragging = true;
  }
  async function onDrop(e: DragEvent) {
    dragging = false;
    const files = [...(e.dataTransfer?.files ?? [])].filter((f) => f.type.startsWith('image/'));
    if (files.length === 0) return;
    e.preventDefault();
    await editor.addAssets(files);
  }

  /** 素材を手順の図などへドラッグするときの印（受け手は E-2 で作る） */
  function onDragStart(e: DragEvent, id: string) {
    e.dataTransfer?.setData('application/x-manual-asset', id);
    e.dataTransfer?.setData('text/plain', id);
  }

  function open(id: string) {
    editor.selectAsset(id);
  }
  function openScreen(id: string) {
    const u = usage.get(id);
    const s = u?.screens[0];
    if (s) {
      editor.select({ topicId: s.topicId, screenId: s.screenId });
      editor.mode = 'edit';
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="assets" class:dragging ondragover={onDragOver} ondragleave={() => (dragging = false)} ondrop={onDrop} data-testid="assets-panel">
  <div class="row spread head">
    <div class="row">
      <input bind:this={fileInput} class="sr-only" type="file" accept="image/*" multiple onchange={onPick} data-testid="assets-add-input" />
      <input bind:this={folderInput} class="sr-only" type="file" accept="image/*" multiple webkitdirectory onchange={onPick} />
      <input bind:this={bulkInput} class="sr-only" type="file" accept="image/*" multiple onchange={onBulk} data-testid="assets-assign-input" />
      <button class="btn small primary" type="button" onclick={() => fileInput?.click()} data-testid="assets-add">{t('assets.add')}</button>
      <button class="btn small" type="button" onclick={() => folderInput?.click()}>{t('assets.addFolder')}</button>
      {#if missingCount > 0}
        <button class="btn small" type="button" onclick={() => bulkInput?.click()}>{t('library.assignBulk')}</button>
      {/if}
      {#if unusedCount > 0}
        <button class="btn small" type="button" onclick={() => editor.apply((x) => removeUnusedAssets(x))} data-testid="assets-prune">{t('library.pruneAssets')}</button>
      {/if}
      <span class="muted small">{t('assets.pasteHint')}</span>
    </div>
    <div class="filters" role="group" aria-label={t('assets.filterLabel')}>
      <button type="button" class:on={filter === 'all'} aria-pressed={filter === 'all'} onclick={() => (filter = 'all')}>{t('assets.filter.all', { n: assets.length })}</button>
      <button type="button" class:on={filter === 'unused'} aria-pressed={filter === 'unused'} onclick={() => (filter = 'unused')} class:warn={unusedCount > 0}>{t('assets.filter.unused', { n: unusedCount })}</button>
      <button type="button" class:on={filter === 'missing'} aria-pressed={filter === 'missing'} onclick={() => (filter = 'missing')} class:err={missingCount > 0}>{t('assets.filter.missing', { n: missingCount })}</button>
    </div>
  </div>
  <p class="muted small help">{t('assets.help')}</p>

  {#if assets.length === 0}
    <p class="muted empty">{t('assets.empty')}</p>
  {:else if shown.length === 0}
    <p class="muted small">{t('assets.noMatch')}</p>
  {:else}
    <ul class="grid" aria-label={t('assets.heading')}>
      {#each shown as a (a.id)}
        {@const url = editor.images.get(a.id)}
        {@const size = editor.sizes.get(a.id)}
        {@const n = usageCount(a.id)}
        {@const u = usage.get(a.id)}
        {@const selected = editor.selection.assetId === a.id}
        <li>
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <article
            class="card"
            class:selected
            class:unused={n === 0}
            class:missing={!url && a.kind === 'image'}
            draggable="true"
            ondragstart={(e) => onDragStart(e, a.id)}
            data-testid="asset-card"
            data-asset-id={a.id}
          >
            <button type="button" class="thumb" onclick={() => open(a.id)} ondblclick={() => openScreen(a.id)} aria-pressed={selected} title={a.alt || fileName(a.source) || a.id}>
              {#if url}
                <img src={url} alt={a.alt ?? a.id} loading="lazy" />
              {:else}
                <span class="noimg muted small">{a.kind === 'image' ? t('assets.noImage') : a.kind}</span>
              {/if}
            </button>
            <div class="meta">
              <div class="name" title={fileName(a.source) ?? a.id}>{a.alt || fileName(a.source) || a.id}</div>
              <div class="small muted line">
                <span>{embeddedData(a.source) ? t('assets.embedded') : (fileName(a.source) ?? '')}</span>
                <span>{size ? t('assets.size', { w: size.w, h: size.h }) : t('assets.sizeUnknown')}</span>
              </div>
              <div class="line badges">
                {#if n === 0}
                  <span class="badge warn">{t('assets.unused')}</span>
                {:else}
                  {#if u && u.screens.length}<span class="badge">{t('assets.usedScreens', { n: u.screens.length })}</span>{/if}
                  {#if u && u.steps.length}<span class="badge">{t('assets.usedSteps', { n: u.steps.length })}</span>{/if}
                  {#if u && u.blocks.length}<span class="badge">{t('assets.usedBlocks', { n: u.blocks.length })}</span>{/if}
                {/if}
                {#if !url && a.kind === 'image'}<span class="badge err">{t('assets.noImage')}</span>{/if}
              </div>
            </div>
          </article>
        </li>
      {/each}
    </ul>
  {/if}
  {#if dragging}
    <div class="dropzone" aria-hidden="true">{t('assets.dropHere')}</div>
  {/if}
</div>

<style>
  .assets {
    position: relative;
    min-height: 100%;
  }
  .assets.dragging {
    outline: 2px dashed var(--accent);
    outline-offset: -2px;
    border-radius: var(--radius);
  }
  .dropzone {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    background: color-mix(in srgb, var(--accent-soft) 85%, transparent);
    color: var(--accent);
    font-weight: 600;
    border-radius: var(--radius);
    pointer-events: none;
  }
  .head {
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .help {
    margin: 0.3rem 0 0.6rem;
  }
  .filters {
    display: inline-flex;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }
  .filters button {
    font: inherit;
    font-size: 0.8rem;
    color: inherit;
    background: none;
    border: none;
    padding: 0.25rem 0.6rem;
    cursor: pointer;
  }
  .filters button + button {
    border-left: 1px solid var(--border);
  }
  .filters button.on {
    background: var(--surface-2);
    font-weight: 600;
  }
  .filters button.warn:not(.on) {
    color: var(--warn);
  }
  .filters button.err:not(.on) {
    color: var(--danger);
  }
  .empty {
    padding: 1.5rem;
    text-align: center;
    border: 1px dashed var(--border);
    border-radius: var(--radius);
  }
  .grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
    gap: 0.6rem;
  }
  .card {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    cursor: grab;
  }
  .card.selected {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent-soft);
  }
  .card.missing {
    border-style: dashed;
  }
  .thumb {
    display: block;
    width: 100%;
    aspect-ratio: 4 / 3;
    background: var(--surface-2);
    border: none;
    padding: 0;
    cursor: pointer;
    display: grid;
    place-items: center;
  }
  .thumb img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
  }
  .meta {
    padding: 0.4rem 0.5rem 0.5rem;
    display: grid;
    gap: 0.2rem;
  }
  .name {
    font-size: 0.85rem;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .line {
    display: flex;
    gap: 0.5rem;
    justify-content: space-between;
    flex-wrap: wrap;
  }
  .badges {
    justify-content: flex-start;
    gap: 0.3rem;
  }
</style>
