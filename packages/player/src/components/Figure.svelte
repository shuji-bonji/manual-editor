<!--
  図（assetRef）の表示。手順（P-2）と説明（P-3）で使う。
  - 画像: 小さく出し、押すと大きくする。
  - Screen の id を指すとき: その画面を Stage で開く（手順と画面遷移をつなぐ。設計書 P-2）。
  - 画像以外（3D・動画・文書）: 種類とファイル名を出す（表示は後の版）。
-->
<script lang="ts">
  import type { Manual } from '@shuji-bonji/experiential-manual-model';
  import { assetUrl, findAsset } from '../runtime/assets.js';
  import { findScreen } from '../runtime/lookup.js';
  import Stage from './Stage.svelte';
  import { t, type Lang } from './text.js';

  interface Props {
    manual: Manual;
    assetRef: string;
    title?: string;
    baseUrl?: string | URL;
    lang?: Lang;
    /** 最初から大きく出す（P-3 の figure） */
    large?: boolean;
  }
  let { manual, assetRef, title, baseUrl, lang = 'ja', large = false }: Props = $props();

  const screen = $derived(findScreen(manual, assetRef));
  const asset = $derived(findAsset(manual, assetRef));
  const url = $derived(assetUrl(manual, assetRef, baseUrl));
  let open = $state(false);
  $effect(() => {
    open = large;
  });
</script>

{#if screen}
  <figure class="em-fig screen" class:open>
    <button type="button" class="toggle" onclick={() => (open = !open)}>
      {open ? t(lang, 'proc.closeScreen') : t(lang, 'proc.openScreen')}: {screen.screen.caption ?? screen.screen.id}
    </button>
    {#if open}
      <Stage {manual} screen={screen.screen} {baseUrl} hints />
    {/if}
    {#if title}<figcaption>{title}</figcaption>{/if}
  </figure>
{:else if asset?.kind === 'image' && url}
  <figure class="em-fig image" class:open>
    <button type="button" class="img" onclick={() => (open = !open)} title={open ? t(lang, 'fig.shrink') : t(lang, 'fig.enlarge')}>
      <img src={url} alt={asset.alt ?? title ?? asset.id} />
    </button>
    {#if title || asset.credit}
      <figcaption>{title ?? ''}{asset.credit ? ` （${asset.credit}）` : ''}</figcaption>
    {/if}
  </figure>
{:else if asset}
  <p class="em-fig other">{t(lang, 'fig.other', { kind: asset.kind, name: asset.source.path ?? asset.id })}</p>
{:else}
  <p class="em-fig other">{assetRef}</p>
{/if}

<style>
  .em-fig {
    margin: 0.4rem 0;
    font-size: 0.85rem;
    color: var(--em-muted, #5d6878);
  }
  .em-fig.image .img {
    display: block;
    padding: 0;
    border: 1px solid var(--em-border, #d3d9e2);
    border-radius: var(--em-radius, 6px);
    background: var(--em-surface, #fff);
    cursor: zoom-in;
    overflow: hidden;
    max-width: 12rem;
  }
  .em-fig.image.open .img {
    max-width: min(100%, 40rem);
    cursor: zoom-out;
  }
  .em-fig img {
    display: block;
    width: 100%;
    height: auto;
  }
  figcaption {
    margin-top: 0.2rem;
  }
  .toggle {
    font: inherit;
    color: var(--em-accent, #1f5fbf);
    background: var(--em-surface, #fff);
    border: 1px solid var(--em-border, #d3d9e2);
    border-radius: var(--em-radius, 6px);
    padding: 0.25rem 0.6rem;
    cursor: pointer;
    margin-bottom: 0.4rem;
  }
  .other {
    font-style: italic;
  }
</style>
