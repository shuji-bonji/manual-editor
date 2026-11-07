<!-- マニュアルの情報、適用範囲（Scope）の作成、素材（画像）の一覧 -->
<script lang="ts">
  import { editor } from '$lib/state.svelte';
  import {
    addScope,
    removeScope,
    removeUnusedAssets,
    updateAsset,
    updateManual,
    updateScope,
    usedAssetIds
  } from '$lib/ops';
  import { basename, isDataUrl } from '$lib/io';
  import { t } from '$lib/i18n';

  let assignInput: HTMLInputElement | undefined = $state();
  let assignOne = $state<string | undefined>();
  let bulkInput: HTMLInputElement | undefined = $state();

  const m = $derived(editor.manual);
  const used = $derived(usedAssetIds(m));

  const splitValues = (s: string) =>
    s
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);

  async function onAssignOne(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file && assignOne) await editor.attachImage(assignOne, file);
  }

  async function onBulk(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = '';
    await editor.assignImagesByName(files);
  }
</script>

<div class="stack">
  <section class="panel" aria-labelledby="meta-h">
    <h2 id="meta-h">{t('library.meta')}</h2>
    <div class="grid">
      <label class="field">
        <span class="caption">{t('manual.title')}</span>
        <input type="text" value={m.title} oninput={(e) => editor.apply((x) => updateManual(x, { title: e.currentTarget.value }), 'manual-title')} data-testid="manual-title" />
      </label>
      <label class="field">
        <span class="caption">{t('manual.language')}</span>
        <input type="text" value={m.language} oninput={(e) => editor.apply((x) => updateManual(x, { language: e.currentTarget.value }), 'manual-lang')} />
      </label>
      <label class="field">
        <span class="caption">{t('manual.version')}</span>
        <input type="text" value={m.version.number} oninput={(e) => editor.apply((x) => updateManual(x, { versionNumber: e.currentTarget.value }), 'manual-ver')} />
      </label>
      <label class="field">
        <span class="caption">{t('manual.versionDate')}</span>
        <input type="text" placeholder="YYYY-MM-DD" value={m.version.date ?? ''} oninput={(e) => editor.apply((x) => updateManual(x, { versionDate: e.currentTarget.value }), 'manual-date')} />
      </label>
    </div>
    <label class="field">
      <span class="caption">{t('manual.description')}</span>
      <textarea value={m.description ?? ''} oninput={(e) => editor.apply((x) => updateManual(x, { description: e.currentTarget.value }), 'manual-desc')}></textarea>
    </label>
  </section>

  <section class="panel" aria-labelledby="scopes-h">
    <h2 id="scopes-h">{t('library.scopes')}</h2>
    <p class="muted small">{t('library.scopesHelp')}</p>
    {#each m.scopes ?? [] as s (s.id)}
      <div class="scope">
        <label class="field">
          <span class="caption">{t('scope.displayText')}</span>
          <input type="text" value={s.displayText} oninput={(e) => editor.apply((x) => updateScope(x, s.id, { displayText: e.currentTarget.value }), `scope-dt:${s.id}`)} />
        </label>
        <label class="field">
          <span class="caption">{t('scope.property')}</span>
          <input type="text" value={s.property} oninput={(e) => editor.apply((x) => updateScope(x, s.id, { property: e.currentTarget.value }), `scope-pr:${s.id}`)} />
        </label>
        <label class="field">
          <span class="caption">{t('scope.values')}</span>
          <input type="text" value={s.values.join(', ')} onchange={(e) => editor.apply((x) => updateScope(x, s.id, { values: splitValues(e.currentTarget.value) }))} />
        </label>
        <button class="btn small danger" type="button" onclick={() => confirm(t('scope.confirmRemove', { name: s.displayText })) && editor.apply((x) => removeScope(x, s.id))}>{t('common.remove')}</button>
      </div>
    {/each}
    <button class="btn" type="button" data-testid="add-scope" onclick={() => editor.apply((x) => addScope(x, { property: 'model', values: ['MV-50'], displayText: t('scope.newName', { n: (x.scopes?.length ?? 0) + 1 }) }))}>{t('scope.add')}</button>
  </section>

  <section class="panel" aria-labelledby="assets-h">
    <h2 id="assets-h">{t('library.assets')}</h2>
    <p class="muted small">{t('library.assetsHelp')}</p>
    <input bind:this={assignInput} class="sr-only" type="file" accept="image/*" onchange={onAssignOne} />
    <input bind:this={bulkInput} class="sr-only" type="file" accept="image/*" multiple onchange={onBulk} />
    <div class="row">
      <button class="btn small" type="button" onclick={() => bulkInput?.click()}>{t('library.assignBulk')}</button>
      <button class="btn small" type="button" onclick={() => editor.apply((x) => removeUnusedAssets(x))}>{t('library.pruneAssets')}</button>
    </div>
    <ul class="list assets">
      {#each m.assets ?? [] as a (a.id)}
        <li>
          <div class="asset">
            {#if editor.images.get(a.id)}
              <img src={editor.images.get(a.id)} alt={a.alt ?? a.id} />
            {:else}
              <div class="noimg muted small">{a.kind === 'image' ? t('library.noImage') : a.kind}</div>
            {/if}
            <div class="info">
              <div><code>{a.id}</code> <span class="badge">{a.kind}</span> {#if !used.has(a.id)}<span class="badge warn">{t('library.unused')}</span>{/if}</div>
              <div class="small muted">{isDataUrl(a.source.path) ? t('screen.embedded') : basename(a.source.path)}</div>
              <label class="field">
                <span class="caption">{t('library.alt')}</span>
                <input type="text" value={a.alt ?? ''} oninput={(e) => editor.apply((x) => updateAsset(x, a.id, { alt: e.currentTarget.value }), `asset-alt:${a.id}`)} />
              </label>
              {#if a.kind === 'image'}
                <button class="btn small" type="button" onclick={() => { assignOne = a.id; assignInput?.click(); }}>{t('library.assignOne')}</button>
              {/if}
            </div>
          </div>
        </li>
      {/each}
    </ul>
    {#if (m.assets ?? []).length === 0}
      <p class="muted small">{t('library.noAssets')}</p>
    {/if}
  </section>
</div>

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
    gap: 0 var(--gap);
  }
  .scope {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.5rem;
    margin-bottom: 0.5rem;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
    gap: 0 var(--gap);
    align-items: end;
  }
  .assets {
    margin-top: 0.5rem;
  }
  .asset {
    display: flex;
    gap: 0.75rem;
    padding: 0.5rem;
  }
  .asset img,
  .noimg {
    width: 8rem;
    height: 6rem;
    object-fit: contain;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    flex: none;
    display: grid;
    place-items: center;
    text-align: center;
  }
  .info {
    flex: 1;
    min-width: 0;
  }
</style>
