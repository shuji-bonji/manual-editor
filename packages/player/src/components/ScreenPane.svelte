<!--
  P-1 の右の欄: 画面の名前・説明・注意と、「押せる場所」の一覧。
  一覧はホットスポットと同じ順で、ボタンなのでキーボードだけでも進める。
-->
<script lang="ts">
  import type { Hotspot, Screen } from '@shuji-bonji/experiential-manual-model';
  import type { Pressable } from '../runtime/flow.js';
  import Admonitions from './Admonitions.svelte';
  import { t, type Lang } from './text.js';

  interface Props {
    screen: Screen;
    pressable: Pressable[];
    lang?: Lang;
    onpress?: (hotspot: Hotspot) => void;
  }
  let { screen, pressable, lang = 'ja', onpress }: Props = $props();

  function destination(p: Pressable): string {
    const target = p.target;
    if (!target) return '';
    if (target.kind === 'screen') return t(lang, 'flow.toScreen', { caption: target.screen.caption ?? target.screen.id });
    return t(lang, 'flow.step', { title: target.topic.title });
  }
</script>

<aside class="em-pane">
  <h3>{screen.caption ?? screen.id}</h3>
  {#if screen.description}<p class="desc">{screen.description}</p>{/if}
  <Admonitions items={screen.admonitions} {lang} />
  {#if pressable.length > 0}
    <h4>{t(lang, 'flow.pressable')}（{pressable.length}）</h4>
    <ul>
      {#each pressable as p (p.hotspot.id)}
        <li>
          <button type="button" class:read={p.hotspot.action === 'read'} onclick={() => onpress?.(p.hotspot)}>
            <span class="label">{p.hotspot.label || p.hotspot.id}</span>
            {#if p.hotspot.action === 'input'}<span class="tag">{t(lang, 'flow.input')}</span>{/if}
            <span class="to">{destination(p)}</span>
          </button>
          {#if p.condition}<span class="cond">{p.condition}</span>{/if}
        </li>
      {/each}
    </ul>
  {:else}
    <p class="muted">{t(lang, 'flow.end')}</p>
  {/if}
</aside>

<style>
  .em-pane {
    font: 0.95rem/1.6 var(--em-font, system-ui, sans-serif);
    color: var(--em-text, #1c2330);
  }
  h3 {
    margin: 0 0 0.5rem;
    font-size: 1.1rem;
  }
  h4 {
    margin: 1rem 0 0.4rem;
    font-size: 0.85rem;
    color: var(--em-muted, #5d6878);
    font-weight: 600;
  }
  .desc {
    margin: 0 0 0.5rem;
    white-space: pre-wrap;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.35rem;
  }
  button {
    width: 100%;
    display: flex;
    gap: 0.5rem;
    align-items: baseline;
    text-align: left;
    font: inherit;
    color: inherit;
    padding: 0.4rem 0.6rem;
    border: 1px solid var(--em-border, #d3d9e2);
    border-radius: var(--em-radius, 6px);
    background: var(--em-surface, #fff);
    cursor: pointer;
  }
  button:hover,
  button:focus-visible {
    border-color: var(--em-accent, #1f5fbf);
    outline: none;
    box-shadow: 0 0 0 2px var(--em-accent-soft, #dbe8fb);
  }
  .label {
    font-weight: 600;
  }
  .tag {
    font-size: 0.75rem;
    padding: 0 0.4em;
    border-radius: 999px;
    background: var(--em-accent-soft, #dbe8fb);
    color: var(--em-accent, #1f5fbf);
  }
  .to {
    margin-left: auto;
    color: var(--em-muted, #5d6878);
    font-size: 0.85rem;
  }
  .cond {
    display: block;
    padding: 0 0.6rem;
    font-size: 0.8rem;
    color: var(--em-muted, #5d6878);
  }
  .muted {
    color: var(--em-muted, #5d6878);
  }
</style>
