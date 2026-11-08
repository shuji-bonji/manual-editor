<!--
  インスペクターの「素材」: 素材の引き出し（E-6）で選んだ素材の、代替テキスト・出典、ファイル名と大きさ、使っている場所、
  画像の割り当て・差し替え、保存、マスク（塗りつぶし）、削除。
-->
<script lang="ts">
  import { editor } from '$lib/state.svelte';
  import { assetUsage, removeAsset, updateAsset, updateAssetSource } from '$lib/ops';
  import { embeddedData, fileName, sha256Of } from '$lib/io';
  import { t } from '$lib/i18n';
  import MaskDialog from './MaskDialog.svelte';

  let { assetId }: { assetId: string } = $props();

  const m = $derived(editor.manual);
  const asset = $derived(m.assets?.find((a) => a.id === assetId));
  const url = $derived(editor.images.get(assetId));
  const size = $derived(editor.sizes.get(assetId));
  const usage = $derived(assetUsage(m).get(assetId));
  const useCount = $derived(usage ? usage.screens.length + usage.steps.length + usage.blocks.length : 0);

  let replaceInput: HTMLInputElement | undefined = $state();
  let masking = $state(false);

  function titleOf(topicId: string): string {
    return m.topics.find((x) => x.id === topicId)?.title ?? topicId;
  }
  function screenName(topicId: string, screenId: string): string {
    const s = m.topics.find((x) => x.id === topicId)?.screens?.find((x) => x.id === screenId);
    return s?.caption || screenId;
  }

  async function onReplace(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (await editor.attachImage(assetId, file)) {
      // 差し替えなので、ファイル名・種類・hash も新しいものにし、埋め込んであった data URL は外す
      const hash = await sha256Of(file);
      editor.apply((x) => updateAssetSource(x, assetId, { path: file.name, mediaType: file.type, hash, data: null }));
    }
  }

  function remove() {
    if (!asset) return;
    const name = asset.alt || fileName(asset.source) || asset.id;
    const ok = useCount > 0 ? confirm(t('assets.confirmRemoveUsed', { name, n: useCount })) : confirm(t('assets.confirmRemove', { name }));
    if (!ok) return;
    editor.apply((x) => removeAsset(x, assetId));
    editor.selectAsset(undefined);
  }
</script>

{#if asset}
  <div class="stack" data-testid="asset-form">
    <div class="preview">
      {#if url}
        <img src={url} alt={asset.alt ?? asset.id} />
      {:else}
        <span class="muted small">{t('assets.noImage')}</span>
      {/if}
    </div>
    <div class="small muted facts">
      <div><span class="k">{t('assets.file')}</span> <code>{embeddedData(asset.source) ? t('assets.embedded') : (asset.source.path ?? '')}</code></div>
      <div><span class="k">id</span> <code>{asset.id}</code> <span class="badge">{asset.kind}</span></div>
      <div>{size ? t('screen.size', { w: size.w, h: size.h }) : t('screen.sizeUnknown')}</div>
    </div>
    <label class="field">
      <span class="caption">{t('library.alt')}</span>
      <input type="text" value={asset.alt ?? ''} oninput={(e) => editor.apply((x) => updateAsset(x, assetId, { alt: e.currentTarget.value }), `asset-alt:${assetId}`)} data-testid="asset-alt" />
    </label>
    <label class="field">
      <span class="caption">{t('assets.credit')}</span>
      <input type="text" value={asset.credit ?? ''} oninput={(e) => editor.apply((x) => updateAsset(x, assetId, { credit: e.currentTarget.value }), `asset-credit:${assetId}`)} />
    </label>

    <section>
      <h3>{t('assets.usedBy')} {#if useCount === 0}<span class="badge warn">{t('assets.unused')}</span>{/if}</h3>
      {#if usage}
        <ul class="uses">
          {#each usage.screens as u (u.screenId)}
            <li><button type="button" class="link" onclick={() => { editor.select({ topicId: u.topicId, screenId: u.screenId }); editor.mode = 'edit'; }}>{titleOf(u.topicId)} › {screenName(u.topicId, u.screenId)}</button></li>
          {/each}
          {#each usage.steps as u (u.stepId)}
            <li><button type="button" class="link" onclick={() => { editor.select({ topicId: u.topicId, stepId: u.stepId }); editor.mode = 'edit'; }}>{titleOf(u.topicId)} › {t('kind.procedure')}</button></li>
          {/each}
          {#each usage.blocks as u, i (u.blockId ?? i)}
            <li><button type="button" class="link" onclick={() => { editor.select({ topicId: u.topicId }); editor.mode = 'edit'; }}>{titleOf(u.topicId)} › {t('kind.description')}</button></li>
          {/each}
        </ul>
      {/if}
    </section>

    <div class="row wrap">
      <input bind:this={replaceInput} class="sr-only" type="file" accept="image/*" onchange={onReplace} data-testid="asset-replace-input" />
      <button class="btn small" type="button" onclick={() => replaceInput?.click()}>{url ? t('assets.replace') : t('assets.assign')}</button>
      {#if url && asset.kind === 'image'}
        <button class="btn small" type="button" onclick={() => (masking = true)} data-testid="asset-mask">{t('assets.mask')}</button>
        <button class="btn small" type="button" onclick={() => editor.downloadImage(assetId)}>{t('assets.download')}</button>
      {/if}
    </div>
    <button class="btn small danger" type="button" onclick={remove} data-testid="asset-remove">{t('assets.remove')}</button>
  </div>
  {#if masking}
    <MaskDialog {assetId} onclose={() => (masking = false)} />
  {/if}
{:else}
  <p class="muted small">{t('inspector.none')}</p>
{/if}

<style>
  .stack {
    display: grid;
    gap: 0.6rem;
  }
  .preview {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    aspect-ratio: 4 / 3;
    display: grid;
    place-items: center;
    overflow: hidden;
  }
  .preview img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
  .facts {
    display: grid;
    gap: 0.15rem;
    word-break: break-all;
  }
  .k {
    display: inline-block;
    min-width: 4.5em;
  }
  h3 {
    font-size: 0.85rem;
    margin: 0 0 0.3rem;
    color: var(--muted);
    display: flex;
    gap: 0.4rem;
    align-items: center;
  }
  .uses {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.15rem;
    font-size: 0.85rem;
  }
  .link {
    font: inherit;
    color: var(--accent);
    background: none;
    border: none;
    padding: 0.1rem 0;
    cursor: pointer;
    text-align: left;
  }
  .link:hover {
    text-decoration: underline;
  }
  .wrap {
    flex-wrap: wrap;
  }
</style>
