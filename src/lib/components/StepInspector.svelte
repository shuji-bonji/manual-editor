<!--
  インスペクターの「手順」（E-2 / E-4）: 中央のアウトライナーで選んだ手順の、操作対象（targetRef）・図（assetRefs）・分岐（next）・適用範囲・削除。
  文・結果・注意・答えは中央で書く（書く頻度が高いので隠さない）。
-->
<script lang="ts">
  import { numberSteps, type Step, type Topic } from '@shuji-bonji/experiential-manual-model';
  import { editor } from '$lib/state.svelte';
  import { addStepAsset, addStepBranch, removeStep, removeStepBranch, setStepAssets, updateStep, updateStepBranch } from '$lib/ops';
  import { fileName } from '$lib/io';
  import { t } from '$lib/i18n';
  import ScopeRefs from './ScopeRefs.svelte';
  import TargetSelect from './TargetSelect.svelte';

  let { topic, step }: { topic: Topic; step: Step } = $props();

  const number = $derived(numberSteps(topic.steps ?? []).find((n) => n.step.id === step.id)?.number ?? '');
  const assets = $derived(editor.manual.assets ?? []);
  const unusedHere = $derived(assets.filter((a) => !(step.assetRefs ?? []).includes(a.id)));

  /** 操作対象に選べるホットスポット（画面ごとにまとめる）と Block の id */
  const hotspotChoices = $derived(
    editor.manual.topics.flatMap((tp) =>
      (tp.screens ?? []).map((s) => ({
        label: `${tp.title} / ${s.caption || s.id}`,
        hotspots: s.hotspots.map((h) => ({ id: h.id, label: h.label || h.id }))
      }))
    )
  );
  const targetKnown = $derived(!step.targetRef || hotspotChoices.some((g) => g.hotspots.some((h) => h.id === step.targetRef)));

  const assetLabel = (id: string) => {
    const a = assets.find((x) => x.id === id);
    return a ? a.alt || fileName(a.source) || a.id : id;
  };

  function remove() {
    if (!confirm(t('step.confirmRemove', { n: number }))) return;
    editor.apply((m) => removeStep(m, topic.id, step.id));
    editor.select({ topicId: topic.id });
  }
</script>

<div class="stack" data-testid="step-form">
  <p class="muted small where">{topic.title} › {t('step.number', { n: number })}</p>

  <label class="field">
    <span class="caption">{t('step.target')}</span>
    <select value={step.targetRef ?? ''} onchange={(e) => editor.apply((m) => updateStep(m, topic.id, step.id, { targetRef: e.currentTarget.value }))}>
      <option value="">{t('step.targetNone')}</option>
      {#if !targetKnown}<option value={step.targetRef}>{t('step.targetBroken', { id: step.targetRef ?? '' })}</option>{/if}
      {#each hotspotChoices as g (g.label)}
        {#if g.hotspots.length > 0}
          <optgroup label={g.label}>
            {#each g.hotspots as h (h.id)}<option value={h.id}>{h.label}</option>{/each}
          </optgroup>
        {/if}
      {/each}
    </select>
  </label>

  <section>
    <h3>{t('step.figures')}</h3>
    {#if step.assetRefs?.length}
      <ul class="plain">
        {#each step.assetRefs as ref (ref)}
          <li class="row spread">
            <button type="button" class="link" onclick={() => { editor.drawer = 'assets'; editor.selectAsset(ref); }}>{assetLabel(ref)}</button>
            <button type="button" class="x" onclick={() => editor.apply((m) => setStepAssets(m, topic.id, step.id, (step.assetRefs ?? []).filter((r) => r !== ref)))} aria-label={t('common.remove')}>×</button>
          </li>
        {/each}
      </ul>
    {/if}
    {#if unusedHere.length}
      <select value="" aria-label={t('step.addFigure')} onchange={(e) => { const id = e.currentTarget.value; if (id) editor.apply((m) => addStepAsset(m, topic.id, step.id, id)); e.currentTarget.value = ''; }} data-testid="add-figure">
        <option value="">{t('step.addFigure')}</option>
        {#each unusedHere as a (a.id)}<option value={a.id}>{a.alt || fileName(a.source) || a.id}{a.kind !== 'image' ? ` (${a.kind})` : ''}</option>{/each}
      </select>
    {:else}
      <p class="muted small">{t('step.noAssets')}</p>
    {/if}
    <p class="muted small">{t('step.figureHint')}</p>
  </section>

  {#if topic.kind === 'procedure'}
    <section>
      <h3>{t('step.branches')}</h3>
      {#each step.next ?? [] as br, i (i)}
        <div class="branch" data-testid="branch">
          <input type="text" value={br.condition ?? ''} placeholder={t('step.branchCondition')} aria-label={t('step.branchCondition')} oninput={(e) => editor.apply((m) => updateStepBranch(m, topic.id, step.id, i, { condition: e.currentTarget.value }), `br-cond:${step.id}:${i}`)} />
          <div class="row">
            <span class="muted">→</span>
            <TargetSelect value={br.to} topicId={topic.id} excludeId={step.id} label={t('step.branchTarget')} testid="branch-target" onchange={(to) => editor.apply((m) => updateStepBranch(m, topic.id, step.id, i, { to }))} />
            <button type="button" class="x" onclick={() => editor.apply((m) => removeStepBranch(m, topic.id, step.id, i))} aria-label={t('common.remove')}>×</button>
          </div>
        </div>
      {/each}
      <button type="button" class="btn small" onclick={() => { const rows = numberSteps(topic.steps ?? []); const i = rows.findIndex((r) => r.step.id === step.id); const to = rows[i + 1]?.step.id ?? rows[0]?.step.id ?? ''; editor.apply((m) => addStepBranch(m, topic.id, step.id, to)); }} data-testid="add-branch">{t('step.addBranch')}</button>
      <p class="muted small">{t('step.branchHint')}</p>
    </section>
  {/if}

  <ScopeRefs target={{ kind: 'step', topicId: topic.id, stepId: step.id }} />
  <button class="btn small danger" type="button" onclick={remove}>{t('step.remove')}</button>
</div>

<style>
  .stack {
    display: grid;
    gap: 0.7rem;
  }
  .where {
    margin: 0;
  }
  h3 {
    font-size: 0.85rem;
    margin: 0 0 0.3rem;
    color: var(--muted);
  }
  .plain {
    list-style: none;
    margin: 0 0 0.3rem;
    padding: 0;
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
  .x {
    font: inherit;
    color: var(--muted);
    background: none;
    border: none;
    cursor: pointer;
    padding: 0 0.3rem;
  }
  .x:hover {
    color: var(--danger);
  }
  .branch {
    display: grid;
    gap: 0.2rem;
    padding: 0.4rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    margin-bottom: 0.4rem;
  }
  .branch :global(select) {
    flex: 1;
    min-width: 0;
  }
</style>
