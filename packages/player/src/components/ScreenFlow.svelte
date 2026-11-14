<!--
  P-1 画面遷移: 通った画面の列（パン屑）、ステージ、右の欄、戻る・最初から・ヒント。
  状態は runtime の createFlow が持ち、この部品は描くだけ。
  行き先が手順（Step）のときは画面を変えず、onleave で外に知らせる（外枠が P-2 を開く）。
-->
<script lang="ts">
  import type { Hotspot, Manual } from '@shuji-bonji/experiential-manual-model';
  import { createFlow, type FlowState, type PressResult } from '../runtime/flow.js';
  import { findScreen, type Target } from '../runtime/lookup.js';
  import type { ScopeSelection } from '../runtime/scope.js';
  import ScreenPane from './ScreenPane.svelte';
  import Stage from './Stage.svelte';
  import { t, type Lang } from './text.js';

  interface Props {
    manual: Manual;
    topicId: string;
    /** 最初に開く画面の id */
    startScreen?: string;
    scope?: ScopeSelection;
    hints?: boolean;
    baseUrl?: string | URL;
    lang?: Lang;
    /** 行き先が手順のとき */
    onleave?: (target: Target) => void;
    /** 画面が変わったとき */
    onchange?: (state: FlowState) => void;
    /** 素材の URL と大きさを外から与える（Stage に渡す） */
    resolveAsset?: (assetRef: string) => { url?: string; width?: number; height?: number } | undefined;
  }

  let {
    manual,
    topicId,
    startScreen,
    scope = {},
    hints = $bindable(false),
    baseUrl,
    lang = 'ja',
    onleave,
    onchange,
    resolveAsset
  }: Props = $props();

  const flow = $derived.by(() => {
    const options = startScreen !== undefined ? { startScreen, scope } : { scope };
    return createFlow(manual, topicId, options);
  });

  let view = $state<FlowState | undefined>();
  let last = $state<PressResult | undefined>();

  $effect(() => {
    last = undefined;
    if (!flow) {
      view = undefined;
      return;
    }
    return flow.subscribe((s) => {
      view = s;
    });
  });

  $effect(() => {
    flow?.setScope(scope);
  });

  function press(h: Hotspot) {
    if (!flow) return;
    const r = flow.press(h.id);
    last = r;
    if (r.type === 'moved' && view) onchange?.(view);
    if (r.type === 'step') onleave?.({ kind: 'step', ...r.target });
  }

  function back() {
    flow?.back();
    last = undefined;
    if (view) onchange?.(view);
  }
  function restart() {
    flow?.restart();
    last = undefined;
    if (view) onchange?.(view);
  }

  const message = $derived.by(() => {
    if (!last) return '';
    switch (last.type) {
      case 'moved':
        return last.condition ? t(lang, 'flow.condition', { text: last.condition }) : '';
      case 'noTransition':
        return t(lang, 'flow.noTransition');
      case 'read':
        // 説明のためのホットスポット。ラベルが説明そのものなので、それを出す
        return t(lang, 'flow.read', { label: last.hotspot.label ?? last.hotspot.id });
      case 'notFound':
        return t(lang, 'flow.notFound', { to: last.to });
      case 'notApplicable':
        return last.condition ? `${t(lang, 'flow.notApplicable')}（${last.condition}）` : t(lang, 'flow.notApplicable');
      case 'step':
        return t(lang, 'flow.step', { title: last.target.topic.title });
      default:
        return '';
    }
  });

  const caption = (id: string) => findScreen(manual, id)?.screen.caption ?? id;
</script>

{#if view?.screen}
  <section class="em-flow">
    <header>
      <h2>{view.topic.title}</h2>
      <ol class="trail" aria-label="trail">
        {#each view.trail as id, i (i)}
          <li class:current={i === view.trail.length - 1}>{caption(id)}</li>
        {/each}
      </ol>
    </header>
    <div class="body">
      <div class="stage">
        <Stage {manual} screen={view.screen} {baseUrl} {hints} onpress={press} {resolveAsset} />
        {#if message}<p class="msg" role="status">{message}</p>{/if}
      </div>
      <ScreenPane screen={view.screen} pressable={view.pressable} {lang} onpress={press} />
    </div>
    <footer>
      <button type="button" disabled={!view.canBack} onclick={back}>← {t(lang, 'flow.back')}</button>
      <button type="button" disabled={!view.canBack} onclick={restart}>{t(lang, 'flow.restart')}</button>
      <label><input type="checkbox" bind:checked={hints} /> {t(lang, 'flow.hints')}</label>
    </footer>
  </section>
{:else}
  <p class="em-flow muted">{t(lang, 'manual.noTopic', { id: topicId })}</p>
{/if}

<style>
  .em-flow {
    container-type: inline-size;
    font: 0.95rem/1.6 var(--em-font, system-ui, sans-serif);
    color: var(--em-text, #1c2330);
  }
  header {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.5rem 1rem;
    margin-bottom: 0.75rem;
  }
  h2 {
    margin: 0;
    font-size: 1.2rem;
  }
  .trail {
    list-style: none;
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin: 0 0 0 auto;
    padding: 0;
    font-size: 0.85rem;
    color: var(--em-muted, #5d6878);
  }
  .trail li + li::before {
    content: '›';
    margin-right: 0.25rem;
  }
  .trail .current {
    color: var(--em-text, #1c2330);
    font-weight: 600;
  }
  .body {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(14rem, 1fr);
    gap: 1rem;
    align-items: start;
  }
  @container (max-width: 44rem) {
    .body {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  .msg {
    margin: 0.5rem 0 0;
    color: var(--em-warn, #8a5a00);
  }
  footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 1rem;
    margin-top: 0.75rem;
    padding-top: 0.5rem;
    border-top: 1px solid var(--em-border, #d3d9e2);
  }
  footer button {
    font: inherit;
    color: inherit;
    padding: 0.3rem 0.8rem;
    border: 1px solid var(--em-border, #d3d9e2);
    border-radius: var(--em-radius, 6px);
    background: var(--em-surface, #fff);
    cursor: pointer;
  }
  footer button:disabled {
    opacity: 0.5;
    cursor: default;
  }
  footer label {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }
  .muted {
    color: var(--em-muted, #5d6878);
  }
</style>
