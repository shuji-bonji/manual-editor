<!--
  P-3 説明: blocks を見出し・段落・箇条書き・表・図・注意として上から出す。
  適用範囲で消える block は applicableBlocks で先に取り除く（TopicView 側）。
  section の children はこの部品を再帰で呼ぶ。
-->
<script lang="ts">
  import type { Block, Manual } from '@shuji-bonji/experiential-manual-model';
  import Admonitions from './Admonitions.svelte';
  import BlockView from './BlockView.svelte';
  import Figure from './Figure.svelte';
  import type { Lang } from './text.js';

  interface Props {
    manual: Manual;
    blocks: Block[];
    baseUrl?: string | URL;
    /** 素材の URL と大きさを外から与える（editor は画像を Manual の外に持つ）。与えたときは、その結果だけを使う */
    resolveAsset?: (assetRef: string) => { url?: string; width?: number; height?: number } | undefined;
    lang?: Lang;
    /** 見出しの深さ（0 で h3） */
    depth?: number;
  }
  let { manual, blocks, baseUrl, lang = 'ja', depth = 0, resolveAsset }: Props = $props();
  const level = $derived(Math.min(6, 3 + depth));
</script>

<div class="em-blocks">
  {#each blocks as b, i (b.id ?? i)}
    {#if b.kind === 'section'}
      <section>
        {#if b.title}
          <svelte:element this={`h${level}`} class="heading">{b.title}</svelte:element>
        {/if}
        {#if b.text}<p>{b.text}</p>{/if}
        {#if b.children}<BlockView {manual} blocks={b.children} {baseUrl} {resolveAsset} {lang} depth={depth + 1} />{/if}
      </section>
    {:else if b.kind === 'para'}
      <p>{b.text}</p>
    {:else if b.kind === 'list'}
      {#if b.ordered}
        <ol>{#each b.items ?? [] as item, j (j)}<li>{item}</li>{/each}</ol>
      {:else}
        <ul>{#each b.items ?? [] as item, j (j)}<li>{item}</li>{/each}</ul>
      {/if}
    {:else if b.kind === 'table'}
      {@const rows = b.rows ?? []}
      <table>
        {#if b.title}<caption>{b.title}</caption>{/if}
        {#if rows[0]}
          <thead><tr>{#each rows[0] as c, j (j)}<th>{c}</th>{/each}</tr></thead>
        {/if}
        <tbody>
          {#each rows.slice(1) as r, j (j)}
            <tr>{#each r as c, k (k)}<td>{c}</td>{/each}</tr>
          {/each}
        </tbody>
      </table>
    {:else if b.kind === 'figure'}
      {#if b.assetRef}<Figure {manual} assetRef={b.assetRef} title={b.title} {baseUrl} {resolveAsset} {lang} large />{/if}
    {:else if b.kind === 'admonition'}
      <Admonitions items={[{ level: b.level ?? 'note', text: b.text ?? '', ...(b.title ? { title: b.title } : {}) }]} {lang} />
    {/if}
  {/each}
</div>

<style>
  .em-blocks {
    font: 0.95rem/1.7 var(--em-font, system-ui, sans-serif);
    color: var(--em-text, #1c2330);
  }
  .heading {
    margin: 1rem 0 0.4rem;
    font-size: 1.05rem;
  }
  p {
    margin: 0.4rem 0;
  }
  ul,
  ol {
    margin: 0.4rem 0;
    padding-left: 1.5rem;
  }
  table {
    border-collapse: collapse;
    margin: 0.6rem 0;
    font-size: 0.9rem;
  }
  caption {
    text-align: left;
    color: var(--em-muted, #5d6878);
    font-size: 0.85rem;
    margin-bottom: 0.2rem;
  }
  th,
  td {
    border: 1px solid var(--em-border, #d3d9e2);
    padding: 0.3rem 0.6rem;
    text-align: left;
    vertical-align: top;
  }
  th {
    background: var(--em-surface-2, #eef1f5);
  }
</style>
