<!--
  P-4 困ったとき: 問いと答えを上から順に追う。
  状態は runtime の createTroubleshooting が持つ。答えた問いは薄く残し、今の問いの答えをボタンで出す。
  対処（question の無い手順）に着いたら、その文と図を出す。行き先が別の Topic なら、開くボタンを出して onleave で外に知らせる。
-->
<script lang="ts">
  import type { Manual, Topic } from '@shuji-bonji/experiential-manual-model';
  import type { Target } from '../runtime/lookup.js';
  import type { ScopeSelection } from '../runtime/scope.js';
  import { createTroubleshooting, type TroubleshootingState } from '../runtime/troubleshooting.js';
  import Admonitions from './Admonitions.svelte';
  import Figure from './Figure.svelte';
  import { t, type Lang } from './text.js';

  interface Props {
    manual: Manual;
    topic: Topic;
    scope?: ScopeSelection;
    baseUrl?: string | URL;
    lang?: Lang;
    onleave?: (target: Target) => void;
  }
  let { manual, topic, scope = {}, baseUrl, lang = 'ja', onleave }: Props = $props();

  const ts = $derived(createTroubleshooting(manual, topic.id, { scope }));
  let view = $state<TroubleshootingState | undefined>();
  let notice = $state('');

  $effect(() => {
    if (!ts) {
      view = undefined;
      return;
    }
    return ts.subscribe((s) => {
      view = s;
    });
  });
  $effect(() => {
    ts?.setScope(scope);
  });

  function answer(i: number) {
    if (!ts) return;
    const r = ts.answer(i);
    notice = r.type === 'notFound' ? t(lang, 'ts.notFound', { to: r.to }) : '';
  }

  const resolvedHere = $derived(view?.resolution?.kind === 'step' && view.resolution.topic.id === topic.id ? view.resolution : undefined);
</script>

{#if view}
  <section class="em-ts">
    <h2>{topic.title}</h2>
    {#if topic.summary}<p class="summary">{topic.summary}</p>{/if}

    <ol class="qa">
      {#each view.history as h, i (i)}
        <li class="asked">
          <div class="q">Q. {h.step.question}</div>
          <div class="a">{h.step.answers?.[h.answerIndex]?.text}</div>
        </li>
      {/each}
      {#if view.question}
        <li class="current" data-question={view.question.id}>
          <div class="q">Q. {view.question.question}</div>
          {#if view.question.text}<div class="hint">{view.question.text}</div>{/if}
          <div class="answers">
            {#each view.answers as a, i (i)}
              <button type="button" disabled={!a.target} onclick={() => answer(i)}>{a.text}</button>
            {/each}
          </div>
        </li>
      {:else if view.resolution}
        <li class="resolution">
          <div class="label">{t(lang, 'ts.resolution')}</div>
          {#if resolvedHere}
            <p class="text">{resolvedHere.step.text}</p>
            {#if resolvedHere.step.expected}<p class="expected">{t(lang, 'proc.expected', { text: resolvedHere.step.expected })}</p>{/if}
            <Admonitions items={resolvedHere.step.admonitions} {lang} />
            {#each resolvedHere.step.assetRefs ?? [] as ref (ref)}<Figure {manual} assetRef={ref} {baseUrl} {lang} large />{/each}
          {:else}
            {@const target = view.resolution}
            {#if target.kind === 'step'}<p class="text">{target.step.text}</p>{/if}
            <button type="button" class="go" onclick={() => onleave?.(target)}>{t(lang, 'ts.goTopic', { title: target.topic.title })} →</button>
          {/if}
        </li>
      {/if}
    </ol>
    {#if notice}<p class="notice" role="status">{notice}</p>{/if}
    <footer>
      <button type="button" disabled={!view.canBack} onclick={() => ts?.back()}>← {t(lang, 'ts.back')}</button>
      <button type="button" disabled={!view.canBack} onclick={() => ts?.restart()}>{t(lang, 'ts.restart')}</button>
    </footer>
  </section>
{/if}

<style>
  .em-ts {
    font: 0.95rem/1.6 var(--em-font, system-ui, sans-serif);
    color: var(--em-text, #1c2330);
  }
  h2 {
    margin: 0 0 0.5rem;
    font-size: 1.2rem;
  }
  .summary {
    margin: 0 0 0.75rem;
    color: var(--em-muted, #5d6878);
  }
  .qa {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.5rem;
  }
  .qa li {
    padding: 0.6rem 0.8rem;
    border-radius: var(--em-radius, 6px);
    border: 1px solid var(--em-border, #d3d9e2);
    background: var(--em-surface, #fff);
  }
  .asked {
    opacity: 0.7;
  }
  .asked .a::before {
    content: '→ ';
  }
  .q {
    font-weight: 600;
  }
  .hint {
    color: var(--em-muted, #5d6878);
    font-size: 0.9rem;
  }
  .current {
    border-color: var(--em-accent, #1f5fbf) !important;
  }
  .answers {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin-top: 0.5rem;
  }
  .answers button,
  .go,
  footer button {
    font: inherit;
    color: inherit;
    background: var(--em-surface-2, #eef1f5);
    border: 1px solid var(--em-border, #d3d9e2);
    border-radius: var(--em-radius, 6px);
    padding: 0.35rem 1rem;
    cursor: pointer;
  }
  .answers button:hover:not(:disabled),
  .go:hover {
    border-color: var(--em-accent, #1f5fbf);
  }
  .answers button:disabled,
  footer button:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .resolution {
    background: var(--em-accent-soft, #dbe8fb) !important;
    border-color: var(--em-accent, #1f5fbf) !important;
  }
  .label {
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--em-accent, #1f5fbf);
  }
  .text {
    margin: 0.2rem 0;
    font-size: 1.05rem;
  }
  .expected {
    margin: 0.1rem 0;
    color: var(--em-muted, #5d6878);
  }
  .go {
    margin-top: 0.4rem;
  }
  footer {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.75rem;
  }
  .notice {
    margin: 0.5rem 0 0;
    color: var(--em-warn, #8a5a00);
  }
</style>
