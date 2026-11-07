<!--
  手順の編集（procedure と troubleshooting の Topic）。手順の追加・入れ子・並べ替え、文と期待される結果、
  操作対象（targetRef）、注意書き（warning / caution / note）、適用範囲（scopeRefs）を扱う。
  troubleshooting の「答えごとの行き先」（Step.answers）は試作では編集できない（読み込んだ値は保たれる）。
-->
<script lang="ts">
  import { numberSteps, type AdmonitionLevel, type Step, type Topic } from '@shuji-bonji/experiential-manual-model';
  import { editor } from '$lib/state.svelte';
  import {
    addAdmonition,
    addStep,
    indentStep,
    moveStep,
    outdentStep,
    removeAdmonition,
    removeStep,
    updateAdmonition,
    updateStep,
    updateTopic
  } from '$lib/ops';
  import { t } from '$lib/i18n';
  import ScopeRefs from './ScopeRefs.svelte';

  let { topic }: { topic: Topic } = $props();

  const levels: AdmonitionLevel[] = ['warning', 'caution', 'note'];
  const steps = $derived(topic.steps ?? []);

  /** 操作対象に選べるホットスポット（画面ごとにまとめる） */
  const hotspotChoices = $derived(
    editor.manual.topics.flatMap((tp) =>
      (tp.screens ?? []).map((s) => ({
        label: `${tp.title} / ${s.caption || s.id}`,
        hotspots: s.hotspots.map((h) => ({ id: h.id, label: h.label || h.id }))
      }))
    )
  );

  /** 手順の番号（1、1.1、2 …）。manual-model の numberSteps が返す番号を id で引く */
  const numbers = $derived(new Map(numberSteps(steps).map((n) => [n.step.id, n.number])));

  function edit(stepId: string, patch: Parameters<typeof updateStep>[3], coalesce: string) {
    editor.apply((m) => updateStep(m, topic.id, stepId, patch), coalesce);
  }
</script>

{#snippet stepNode(step: Step, depth: number, index: number, siblings: number)}
  <li class="step" style:margin-left="{depth * 1.25}rem" data-step-id={step.id}>
    <div class="panel" class:selected={editor.selection.stepId === step.id}>
      <div class="row spread head">
        <strong class="num">{numbers.get(step.id) ?? ''}</strong>
        <div class="row">
          <button class="btn small" type="button" disabled={index === 0} onclick={() => editor.apply((m) => moveStep(m, topic.id, step.id, -1))} aria-label={t('common.up')}>↑</button>
          <button class="btn small" type="button" disabled={index === siblings - 1} onclick={() => editor.apply((m) => moveStep(m, topic.id, step.id, 1))} aria-label={t('common.down')}>↓</button>
          <button class="btn small" type="button" disabled={index === 0} onclick={() => editor.apply((m) => indentStep(m, topic.id, step.id))}>{t('step.indent')}</button>
          <button class="btn small" type="button" disabled={depth === 0} onclick={() => editor.apply((m) => outdentStep(m, topic.id, step.id))}>{t('step.outdent')}</button>
          <button class="btn small danger" type="button" onclick={() => editor.apply((m) => removeStep(m, topic.id, step.id))}>{t('common.remove')}</button>
        </div>
      </div>

      {#if topic.kind === 'troubleshooting'}
        <label class="field">
          <span class="caption">{t('step.question')}</span>
          <input type="text" value={step.question ?? ''} oninput={(e) => edit(step.id, { question: e.currentTarget.value }, `step-q:${step.id}`)} />
        </label>
      {/if}
      <label class="field">
        <span class="caption">{t('step.text')}</span>
        <textarea value={step.text} oninput={(e) => edit(step.id, { text: e.currentTarget.value }, `step-text:${step.id}`)} data-testid="step-text"></textarea>
      </label>
      <label class="field">
        <span class="caption">{t('step.expected')}</span>
        <input type="text" value={step.expected ?? ''} oninput={(e) => edit(step.id, { expected: e.currentTarget.value }, `step-exp:${step.id}`)} />
      </label>
      <label class="field">
        <span class="caption">{t('step.target')}</span>
        <select value={step.targetRef ?? ''} onchange={(e) => edit(step.id, { targetRef: e.currentTarget.value }, `step-target:${step.id}`)}>
          <option value="">{t('step.targetNone')}</option>
          {#if step.targetRef && !hotspotChoices.some((g) => g.hotspots.some((h) => h.id === step.targetRef))}
            <option value={step.targetRef}>{t('step.targetBroken', { id: step.targetRef })}</option>
          {/if}
          {#each hotspotChoices as g (g.label)}
            {#if g.hotspots.length > 0}
              <optgroup label={g.label}>
                {#each g.hotspots as h (h.id)}
                  <option value={h.id}>{h.label}</option>
                {/each}
              </optgroup>
            {/if}
          {/each}
        </select>
      </label>

      <div class="admonitions">
        <h3>{t('admonition.heading')}</h3>
        {#each step.admonitions ?? [] as a, i (i)}
          <div class="row adm">
            <select value={a.level} aria-label={t('admonition.level')} onchange={(e) => editor.apply((m) => updateAdmonition(m, { kind: 'step', topicId: topic.id, stepId: step.id }, i, { level: e.currentTarget.value as AdmonitionLevel }))}>
              {#each levels as l (l)}
                <option value={l}>{t(`level.${l}`)}</option>
              {/each}
            </select>
            <input type="text" value={a.text} aria-label={t('admonition.text')} oninput={(e) => editor.apply((m) => updateAdmonition(m, { kind: 'step', topicId: topic.id, stepId: step.id }, i, { text: e.currentTarget.value }), `step-adm:${step.id}:${i}`)} />
            <button class="btn small danger" type="button" onclick={() => editor.apply((m) => removeAdmonition(m, { kind: 'step', topicId: topic.id, stepId: step.id }, i))}>{t('common.remove')}</button>
          </div>
        {/each}
        <button class="btn small" type="button" onclick={() => editor.apply((m) => addAdmonition(m, { kind: 'step', topicId: topic.id, stepId: step.id }, 'caution', ''))}>{t('admonition.add')}</button>
      </div>

      <div class="gap-top">
        <ScopeRefs target={{ kind: 'step', topicId: topic.id, stepId: step.id }} />
      </div>

      <button class="btn small" type="button" onclick={() => editor.apply((m) => addStep(m, topic.id, '', step.id))}>{t('step.addChild')}</button>
    </div>

    {#if step.children?.length}
      <ol class="steps">
        {#each step.children as child, i (child.id)}
          {@render stepNode(child, depth + 1, i, step.children.length)}
        {/each}
      </ol>
    {/if}
  </li>
{/snippet}

<div class="stack">
  <div class="panel">
    <label class="field">
      <span class="caption">{t('topic.summary')}</span>
      <textarea
        value={topic.summary ?? ''}
        oninput={(e) => editor.apply((m) => updateTopic(m, topic.id, { summary: e.currentTarget.value }), `topic-summary:${topic.id}`)}
      ></textarea>
    </label>
    <ScopeRefs target={{ kind: 'topic', topicId: topic.id }} />
  </div>

  {#if steps.length === 0}
    <p class="muted">{t('step.empty')}</p>
  {/if}
  <ol class="steps">
    {#each steps as step, i (step.id)}
      {@render stepNode(step, 0, i, steps.length)}
    {/each}
  </ol>
  <button class="btn primary" type="button" onclick={() => editor.apply((m) => addStep(m, topic.id, ''))} data-testid="add-step">{t('step.add')}</button>
</div>

<style>
  .steps {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .step {
    margin-top: 0.5rem;
  }
  .head {
    margin-bottom: 0.4rem;
  }
  .num {
    font-family: var(--mono);
  }
  .panel.selected {
    border-color: var(--accent);
  }
  .adm {
    margin-bottom: 0.3rem;
    flex-wrap: nowrap;
  }
  .adm select {
    width: 7rem;
    flex: none;
  }
  .gap-top {
    margin: 0.5rem 0;
  }
</style>
