<!--
  P-2 手順: 番号付きの一覧と、「1 つずつ進める」モード。
  状態は runtime の createProcedure が持つ（番号、今の位置、分岐）。この部品は描くだけ。
  - 番号は表示時に組み立て、適用範囲で消えた手順は番号を詰める。
  - expected は「→」で、admonitions と図は手順の直下に出す。図が Screen を指すときは Stage で開く。
  - Step.next の分岐は手順の末尾に選択肢で出す。行き先が別の Topic なら onleave で外に知らせる。
-->
<script lang="ts">
  import type { Manual, NumberedStep, Topic } from '@shuji-bonji/experiential-manual-model';
  import type { Target } from '../runtime/lookup.js';
  import { createProcedure, type Branch, type NextResult, type ProcedureState } from '../runtime/procedure.js';
  import type { ScopeSelection } from '../runtime/scope.js';
  import Admonitions from './Admonitions.svelte';
  import Figure from './Figure.svelte';
  import { t, type Lang } from './text.js';

  interface Props {
    manual: Manual;
    topic: Topic;
    startStep?: string;
    scope?: ScopeSelection;
    baseUrl?: string | URL;
    lang?: Lang;
    onleave?: (target: Target) => void;
  }
  let { manual, topic, startStep, scope = {}, baseUrl, lang = 'ja', onleave }: Props = $props();

  const proc = $derived.by(() => {
    const options = startStep !== undefined ? { startStep, scope } : { scope };
    return createProcedure(manual, topic.id, options);
  });

  let view = $state<ProcedureState | undefined>();
  let mode = $state<'list' | 'one'>('list');
  let notice = $state('');

  $effect(() => {
    if (!proc) {
      view = undefined;
      return;
    }
    return proc.subscribe((s) => {
      view = s;
    });
  });
  $effect(() => {
    proc?.setScope(scope);
  });

  const applies = $derived(
    (topic.scopeRefs ?? [])
      .map((id) => manual.scopes?.find((s) => s.id === id)?.displayText)
      .filter((x): x is string => x !== undefined)
      .join('、')
  );

  function handle(r: NextResult) {
    notice = '';
    if (r.type === 'choose') notice = t(lang, 'proc.choose');
    else if (r.type === 'end') notice = t(lang, 'proc.end');
    else if (r.type === 'leave') onleave?.(r.target);
    else if (r.type === 'notFound') notice = t(lang, 'ts.notFound', { to: r.to });
  }

  function choose(i: number) {
    if (!proc) return;
    handle(proc.choose(i));
  }

  function branchLabel(b: Branch): string {
    const cond = b.transition.label ?? b.transition.condition ?? '';
    const to = b.number ? t(lang, 'proc.goto', { number: b.number }) : b.target ? b.target.topic.title : b.transition.to;
    return cond ? `${cond} → ${to}` : to;
  }

  const isCurrent = (n: NumberedStep) => view?.current?.step.id === n.step.id;
</script>

{#if view}
  <section class="em-proc">
    <header>
      <h2>{topic.title}</h2>
      {#if applies}<span class="applies">{t(lang, 'proc.applies', { text: applies })}</span>{/if}
      <div class="mode" role="tablist">
        <button type="button" role="tab" aria-selected={mode === 'list'} onclick={() => (mode = 'list')}>{t(lang, 'proc.list')}</button>
        <button type="button" role="tab" aria-selected={mode === 'one'} onclick={() => (mode = 'one')}>{t(lang, 'proc.oneByOne')}</button>
      </div>
    </header>
    {#if topic.summary}<p class="summary">{topic.summary}</p>{/if}

    {#if mode === 'list'}
      <ol class="steps">
        {#each view.steps as n (n.step.id)}
          <li class="step depth-{Math.min(n.depth, 3)}" class:current={isCurrent(n)} data-step={n.step.id}>
            <button type="button" class="num" onclick={() => proc?.goTo(n.step.id)} aria-label={n.number}>{n.number}</button>
            <div class="body">
              <div class="text">{n.step.text}</div>
              {#if n.step.expected}<div class="expected">{t(lang, 'proc.expected', { text: n.step.expected })}</div>{/if}
              <Admonitions items={n.step.admonitions} {lang} />
              {#if n.step.assetRefs?.length}
                <div class="figures">
                  {#each n.step.assetRefs as ref (ref)}<Figure {manual} assetRef={ref} {baseUrl} {lang} />{/each}
                </div>
              {/if}
              {#if isCurrent(n) && view.branches.length > 0}
                <div class="branches">
                  {#each view.branches as b, i (i)}
                    <button type="button" onclick={() => choose(i)}>◇ {branchLabel(b)}</button>
                  {/each}
                </div>
              {/if}
            </div>
          </li>
        {/each}
      </ol>
    {:else if view.current}
      {@const n = view.current}
      <article class="one" data-step={n.step.id}>
        <div class="pos">{n.number} / {view.steps.length}</div>
        <p class="big">{n.step.text}</p>
        {#if n.step.expected}<p class="expected">{t(lang, 'proc.expected', { text: n.step.expected })}</p>{/if}
        <Admonitions items={n.step.admonitions} {lang} />
        {#each n.step.assetRefs ?? [] as ref (ref)}<Figure {manual} assetRef={ref} {baseUrl} {lang} large />{/each}
        {#if view.branches.length > 0}
          <div class="branches">
            {#each view.branches as b, i (i)}
              <button type="button" onclick={() => choose(i)}>◇ {branchLabel(b)}</button>
            {/each}
          </div>
        {/if}
      </article>
      <footer>
        <button type="button" disabled={!view.canPrev} onclick={() => proc && (proc.prev(), (notice = ''))}>← {t(lang, 'proc.prev')}</button>
        <button type="button" disabled={!view.canNext} onclick={() => proc && handle(proc.next())}>{t(lang, 'proc.next')} →</button>
      </footer>
    {/if}
    {#if notice}<p class="notice" role="status">{notice}</p>{/if}
  </section>
{/if}

<style>
  .em-proc {
    font: 0.95rem/1.6 var(--em-font, system-ui, sans-serif);
    color: var(--em-text, #1c2330);
  }
  header {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.5rem 1rem;
    margin-bottom: 0.5rem;
  }
  h2 {
    margin: 0;
    font-size: 1.2rem;
  }
  .applies {
    font-size: 0.85rem;
    color: var(--em-muted, #5d6878);
  }
  .mode {
    margin-left: auto;
    display: flex;
    border: 1px solid var(--em-border, #d3d9e2);
    border-radius: var(--em-radius, 6px);
    overflow: hidden;
  }
  .mode button {
    font: inherit;
    font-size: 0.85rem;
    color: inherit;
    background: var(--em-surface, #fff);
    border: none;
    padding: 0.25rem 0.7rem;
    cursor: pointer;
  }
  .mode button[aria-selected='true'] {
    background: var(--em-accent-soft, #dbe8fb);
    color: var(--em-accent, #1f5fbf);
    font-weight: 600;
  }
  .summary {
    margin: 0 0 0.75rem;
    color: var(--em-muted, #5d6878);
  }
  .steps {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.35rem;
  }
  .step {
    display: grid;
    grid-template-columns: 3rem minmax(0, 1fr);
    gap: 0.5rem;
    padding: 0.4rem 0.5rem;
    border-radius: var(--em-radius, 6px);
    border: 1px solid transparent;
  }
  .step.depth-1 {
    margin-left: 1.5rem;
  }
  .step.depth-2 {
    margin-left: 3rem;
  }
  .step.depth-3 {
    margin-left: 4.5rem;
  }
  .step.current {
    background: var(--em-surface, #fff);
    border-color: var(--em-accent, #1f5fbf);
  }
  .num {
    font: inherit;
    font-weight: 700;
    color: var(--em-accent, #1f5fbf);
    background: transparent;
    border: none;
    text-align: left;
    padding: 0;
    cursor: pointer;
    align-self: start;
  }
  .text {
    white-space: pre-wrap;
  }
  .expected {
    color: var(--em-muted, #5d6878);
    margin: 0.1rem 0;
  }
  .figures {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .branches {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin-top: 0.4rem;
  }
  .branches button,
  footer button {
    font: inherit;
    color: inherit;
    background: var(--em-surface, #fff);
    border: 1px solid var(--em-border, #d3d9e2);
    border-radius: var(--em-radius, 6px);
    padding: 0.3rem 0.8rem;
    cursor: pointer;
  }
  .branches button:hover,
  footer button:hover:not(:disabled) {
    border-color: var(--em-accent, #1f5fbf);
  }
  footer button:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .one {
    padding: 1rem;
    border: 1px solid var(--em-border, #d3d9e2);
    border-radius: var(--em-radius, 6px);
    background: var(--em-surface, #fff);
  }
  .pos {
    font-size: 0.85rem;
    color: var(--em-muted, #5d6878);
  }
  .big {
    font-size: 1.3rem;
    line-height: 1.5;
    margin: 0.4rem 0;
    white-space: pre-wrap;
  }
  footer {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    margin-top: 0.75rem;
  }
  .notice {
    margin: 0.5rem 0 0;
    color: var(--em-warn, #8a5a00);
  }
</style>
