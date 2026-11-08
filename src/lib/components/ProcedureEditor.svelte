<!--
  E-2 手順の編集（procedure）と E-4 困ったときの編集（troubleshooting）。player の P-2 と同じ並びで、文がそのまま入力欄になっている。
  - Enter で直後に手順を足し、Tab で一段深く、Shift+Tab で一段浅く、空の手順で Backspace すると消す（アウトライナーの操作）。
    ↑↓ で前後の手順へ、Alt+↑↓ で並べ替え。
  - expected（→ 結果）と admonitions（⚠）は手順の行の中に出し、空なら薄い案内を出す。
  - 図（assetRefs）は素材の引き出しのカードをドラッグして手順に落とす（dataTransfer の application/x-manual-asset）。画像ファイルのドロップも受ける。
  - 困ったとき: 問い（question）と答え（answers[].next.to）を行の中で編集する。問いの無い手順は「対処」。
  - 操作対象・分岐（next）・図の一覧・適用範囲・削除は右のインスペクター（StepInspector）。行を押すと選ばれる。
-->
<script lang="ts">
  import { tick } from 'svelte';
  import { numberSteps, type AdmonitionLevel, type Step, type Topic } from '@shuji-bonji/experiential-manual-model';
  import { editor } from '$lib/state.svelte';
  import {
    addAdmonition,
    addAnswer,
    addStep,
    addStepAsset,
    indentStep,
    insertStepAfter,
    moveAnswer,
    moveStep,
    outdentStep,
    removeAdmonition,
    removeAnswer,
    removeStep,
    setStepAssets,
    updateAdmonition,
    updateAnswer,
    updateStep,
    updateTopic
  } from '$lib/ops';
  import { fileName } from '$lib/io';
  import { t } from '$lib/i18n';
  import ScopeRefs from './ScopeRefs.svelte';
  import TargetSelect from './TargetSelect.svelte';

  let { topic }: { topic: Topic } = $props();

  const levels: AdmonitionLevel[] = ['warning', 'caution', 'note'];
  const ts = $derived(topic.kind === 'troubleshooting');
  const rows = $derived(numberSteps(topic.steps ?? []));
  const numberOf = $derived(new Map(rows.map((n) => [n.step.id, n.number])));
  const selectedId = $derived(editor.selection.topicId === topic.id ? editor.selection.stepId : undefined);

  let root = $state<HTMLElement | undefined>();
  let focusId = $state<string | undefined>();
  let dropId = $state<string | undefined>();

  /** 文の入力欄にフォーカスを移す（手順を足した直後・消した直後） */
  async function focusStep(id: string | undefined, where: 'text' | 'question' = 'text') {
    if (!id) return;
    focusId = id;
    await tick();
    const el = root?.querySelector<HTMLInputElement>(`[data-step-id="${CSS.escape(id)}"] input.${where}`) ?? root?.querySelector<HTMLInputElement>(`[data-step-id="${CSS.escape(id)}"] input.text`);
    el?.focus();
    focusId = undefined;
  }

  function select(step: Step) {
    if (selectedId !== step.id) editor.select({ topicId: topic.id, stepId: step.id });
  }

  function edit(stepId: string, patch: Parameters<typeof updateStep>[3], coalesce: string) {
    editor.apply((m) => updateStep(m, topic.id, stepId, patch), coalesce);
  }

  /**
   * 問いを書く。Step.text は必須（validateManual）なので、文が空か問いと同じなら問いを文にも写す。
   * 利用者が文を別に書いた後は写さない。
   */
  function editQuestion(step: Step, question: string) {
    const mirror = step.text === '' || step.text === (step.question ?? '');
    edit(step.id, mirror ? { question, text: question } : { question }, `step-q:${step.id}`);
  }

  function addAfter(step: Step) {
    const id = editor.apply((m) => insertStepAfter(m, topic.id, step.id, ''));
    if (id) {
      editor.select({ topicId: topic.id, stepId: id });
      void focusStep(id, ts ? 'question' : 'text');
    }
  }
  function addLast() {
    const id = editor.apply((m) => addStep(m, topic.id, ''));
    if (id) {
      editor.select({ topicId: topic.id, stepId: id });
      void focusStep(id, ts ? 'question' : 'text');
    }
  }
  function remove(step: Step) {
    const i = rows.findIndex((r) => r.step.id === step.id);
    const prev = rows[i - 1]?.step.id ?? rows[i + 1]?.step.id;
    editor.apply((m) => removeStep(m, topic.id, step.id));
    if (prev) {
      editor.select({ topicId: topic.id, stepId: prev });
      void focusStep(prev);
    } else editor.select({ topicId: topic.id });
  }

  function onKey(e: KeyboardEvent, step: Step, i: number) {
    const input = e.currentTarget as HTMLInputElement;
    if (e.isComposing) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      addAfter(step);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      editor.apply((m) => (e.shiftKey ? outdentStep(m, topic.id, step.id) : indentStep(m, topic.id, step.id)));
      void focusStep(step.id, input.classList.contains('question') ? 'question' : 'text');
    } else if (e.key === 'Backspace' && input.value === '' && !step.children?.length && !step.question && !step.expected) {
      e.preventDefault();
      remove(step);
    } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && e.altKey) {
      e.preventDefault();
      editor.apply((m) => moveStep(m, topic.id, step.id, e.key === 'ArrowUp' ? -1 : 1));
      void focusStep(step.id);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const next = rows[i + (e.key === 'ArrowUp' ? -1 : 1)]?.step;
      if (next) {
        e.preventDefault();
        editor.select({ topicId: topic.id, stepId: next.id });
        void focusStep(next.id, input.classList.contains('question') ? 'question' : 'text');
      }
    }
  }

  // ---- 図のドロップ ----
  const ASSET = 'application/x-manual-asset';
  function onDragOver(e: DragEvent, step: Step) {
    const types = e.dataTransfer?.types ?? [];
    if (!types.includes(ASSET) && !types.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'copy';
    dropId = step.id;
  }
  async function onDrop(e: DragEvent, step: Step) {
    dropId = undefined;
    const assetId = e.dataTransfer?.getData(ASSET);
    const files = [...(e.dataTransfer?.files ?? [])].filter((f) => f.type.startsWith('image/'));
    if (!assetId && files.length === 0) return;
    e.preventDefault();
    if (assetId) editor.apply((m) => addStepAsset(m, topic.id, step.id, assetId));
    for (const f of files) {
      const id = await editor.addAssetFromFile(f);
      if (id) editor.apply((m) => addStepAsset(m, topic.id, step.id, id));
    }
  }
  function assetLabel(id: string): string {
    const a = editor.manual.assets?.find((x) => x.id === id);
    return a ? a.alt || fileName(a.source) || a.id : id;
  }
  function removeAsset(step: Step, id: string) {
    editor.apply((m) => setStepAssets(m, topic.id, step.id, (step.assetRefs ?? []).filter((r) => r !== id)));
  }

  /** 行き先を人が読む形に（分岐の要約用） */
  function targetName(to: string): string {
    const n = numberOf.get(to);
    if (n) return t('step.targetStep', { n });
    for (const tp of editor.manual.topics) {
      const s = tp.screens?.find((x) => x.id === to);
      if (s) return s.caption || s.id;
      const st = tp.steps ? numberSteps(tp.steps).find((x) => x.step.id === to) : undefined;
      if (st) return `${tp.title} ${st.number}`;
    }
    return to;
  }
</script>

<div class="proc" bind:this={root} data-testid="procedure-editor">
  <div class="panel head">
    <label class="field">
      <span class="caption">{t('topic.summary')}</span>
      <textarea rows="2" value={topic.summary ?? ''} oninput={(e) => editor.apply((m) => updateTopic(m, topic.id, { summary: e.currentTarget.value }), `topic-summary:${topic.id}`)}></textarea>
    </label>
    <ScopeRefs target={{ kind: 'topic', topicId: topic.id }} quiet />
    <p class="muted small keys">{ts ? t('step.keysTs') : t('step.keys')}</p>
  </div>

  {#if rows.length === 0}
    <p class="muted">{ts ? t('step.emptyTs') : t('step.empty')}</p>
  {/if}
  <ol class="steps">
    {#each rows as n, i (n.step.id)}
      {@const step = n.step}
      {@const selected = selectedId === step.id}
      {@const owner = { kind: 'step', topicId: topic.id, stepId: step.id } as const}
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <li
        class="step depth-{Math.min(n.depth, 4)}"
        class:selected
        class:dropping={dropId === step.id}
        class:resolution={ts && !step.question}
        data-step-id={step.id}
        onfocusin={() => select(step)}
        ondragover={(e) => onDragOver(e, step)}
        ondragleave={() => (dropId = undefined)}
        ondrop={(e) => onDrop(e, step)}
      >
        <button type="button" class="num" onclick={() => { select(step); void focusStep(step.id); }} title={t('step.select')}>{n.number}</button>
        <div class="body">
          {#if ts}
            <div class="qrow">
              <span class="q" aria-hidden="true">Q.</span>
              <input type="text" class="question" value={step.question ?? ''} placeholder={t('step.questionPlaceholder')} oninput={(e) => editQuestion(step, e.currentTarget.value)} onkeydown={(e) => onKey(e, step, i)} data-testid="step-question" />
            </div>
          {/if}
          <input type="text" class="text" value={step.text} placeholder={ts ? t('step.textPlaceholderTs') : t('step.textPlaceholder')} oninput={(e) => edit(step.id, { text: e.currentTarget.value }, `step-text:${step.id}`)} onkeydown={(e) => onKey(e, step, i)} data-testid="step-text" />
          <div class="exp">
            <span class="arrow" aria-hidden="true">→</span>
            <input type="text" class="expected" value={step.expected ?? ''} placeholder={t('step.expectedPlaceholder')} oninput={(e) => edit(step.id, { expected: e.currentTarget.value }, `step-exp:${step.id}`)} />
          </div>

          {#each step.admonitions ?? [] as a, ai (ai)}
            <div class="adm level-{a.level}">
              <select value={a.level} aria-label={t('admonition.level')} onchange={(e) => editor.apply((m) => updateAdmonition(m, owner, ai, { level: e.currentTarget.value as AdmonitionLevel }))}>
                {#each levels as l (l)}<option value={l}>{t(`level.${l}`)}</option>{/each}
              </select>
              <input type="text" value={a.text} placeholder={t('admonition.text')} aria-label={t('admonition.text')} oninput={(e) => editor.apply((m) => updateAdmonition(m, owner, ai, { text: e.currentTarget.value }), `step-adm:${step.id}:${ai}`)} />
              <button type="button" class="x" onclick={() => editor.apply((m) => removeAdmonition(m, owner, ai))} aria-label={t('common.remove')}>×</button>
            </div>
          {/each}

          {#if step.assetRefs?.length}
            <div class="figs">
              {#each step.assetRefs as ref (ref)}
                {@const url = editor.images.get(ref)}
                <span class="fig" title={assetLabel(ref)}>
                  {#if url}<img src={url} alt={assetLabel(ref)} />{:else}<span class="nofig small muted">{assetLabel(ref)}</span>{/if}
                  <button type="button" class="x" onclick={() => removeAsset(step, ref)} aria-label={t('common.remove')}>×</button>
                </span>
              {/each}
            </div>
          {/if}

          {#if ts && step.question}
            <div class="answers">
              {#each step.answers ?? [] as a, ai (ai)}
                <div class="answer">
                  <input type="text" value={a.text} placeholder={t('step.answerText')} aria-label={t('step.answerText')} oninput={(e) => editor.apply((m) => updateAnswer(m, topic.id, step.id, ai, { text: e.currentTarget.value }), `ans:${step.id}:${ai}`)} data-testid="answer-text" />
                  <span class="arrow" aria-hidden="true">→</span>
                  <TargetSelect value={a.next.to} topicId={topic.id} excludeId={step.id} label={t('step.answerTarget')} testid="answer-target" onchange={(to) => editor.apply((m) => updateAnswer(m, topic.id, step.id, ai, { to }))} />
                  <button type="button" class="mini" disabled={ai === 0} onclick={() => editor.apply((m) => moveAnswer(m, topic.id, step.id, ai, -1))} aria-label={t('common.up')}>↑</button>
                  <button type="button" class="x" onclick={() => editor.apply((m) => removeAnswer(m, topic.id, step.id, ai))} aria-label={t('common.remove')}>×</button>
                </div>
              {/each}
              <button type="button" class="btn small" onclick={() => { const next = rows[i + 1]?.step.id ?? rows[0]?.step.id ?? ''; editor.apply((m) => addAnswer(m, topic.id, step.id, t('step.answerDefault', { n: (step.answers?.length ?? 0) + 1 }), next)); }} data-testid="add-answer">{t('step.addAnswer')}</button>
            </div>
          {/if}

          {#if step.next?.length}
            <div class="branches small">
              {#each step.next as br, bi (bi)}
                <div>◇ {br.condition || t('step.branchAny')} → {targetName(br.to)}</div>
              {/each}
            </div>
          {/if}

          <div class="inline-tools row">
            <button type="button" class="mini" onclick={() => editor.apply((m) => addAdmonition(m, owner, 'caution', ''))}>{t('admonition.add')}</button>
            {#if ts && !step.question}<span class="muted small">{t('step.resolutionNote')}</span>{/if}
          </div>
        </div>
        <div class="tools">
          <button type="button" class="mini" disabled={i === 0} onclick={() => { editor.apply((m) => moveStep(m, topic.id, step.id, -1)); }} aria-label={t('common.up')} title={t('common.up')}>↑</button>
          <button type="button" class="mini" onclick={() => { editor.apply((m) => moveStep(m, topic.id, step.id, 1)); }} aria-label={t('common.down')} title={t('common.down')}>↓</button>
          <button type="button" class="mini" onclick={() => editor.apply((m) => indentStep(m, topic.id, step.id))} aria-label={t('step.indent')} title={t('step.indent')}>⇥</button>
          <button type="button" class="mini" disabled={n.depth === 0} onclick={() => editor.apply((m) => outdentStep(m, topic.id, step.id))} aria-label={t('step.outdent')} title={t('step.outdent')}>⇤</button>
          <button type="button" class="mini danger" onclick={() => remove(step)} aria-label={t('common.remove')} title={t('common.remove')}>×</button>
        </div>
      </li>
    {/each}
  </ol>
  <button class="btn primary" type="button" onclick={addLast} data-testid="add-step">{ts ? t('step.addTs') : t('step.add')}</button>
</div>

<style>
  .head {
    margin-bottom: 0.5rem;
  }
  .keys {
    margin: 0.2rem 0 0;
  }
  .steps {
    list-style: none;
    margin: 0 0 0.5rem;
    padding: 0;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
  .step {
    display: grid;
    grid-template-columns: 3.2rem minmax(0, 1fr) auto;
    gap: 0.4rem;
    padding: 0.45rem 0.5rem 0.45rem 0;
    border-bottom: 1px solid var(--border);
  }
  .step:last-child {
    border-bottom: none;
  }
  .step.selected {
    background: var(--accent-soft);
  }
  .step.dropping {
    outline: 2px dashed var(--accent);
    outline-offset: -2px;
  }
  .step.depth-1 {
    padding-left: 1.4rem;
  }
  .step.depth-2 {
    padding-left: 2.8rem;
  }
  .step.depth-3 {
    padding-left: 4.2rem;
  }
  .step.depth-4 {
    padding-left: 5.6rem;
  }
  .num {
    font: inherit;
    font-family: var(--mono);
    font-weight: 600;
    color: var(--muted);
    background: none;
    border: none;
    text-align: right;
    padding: 0.3rem 0.4rem 0 0;
    cursor: pointer;
    align-self: start;
  }
  .step.selected .num {
    color: var(--accent);
  }
  .body {
    display: grid;
    gap: 0.25rem;
    min-width: 0;
  }
  .body input[type='text'] {
    background: transparent;
    border-color: transparent;
    padding: 0.25rem 0.4rem;
  }
  .body input[type='text']:hover {
    border-color: var(--border);
  }
  .body input[type='text']:focus {
    background: var(--surface);
    border-color: var(--accent);
  }
  input.text {
    font-size: 1rem;
  }
  .qrow,
  .exp,
  .adm,
  .answer {
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }
  .q {
    font-weight: 700;
    color: var(--accent);
  }
  .resolution .q {
    color: var(--muted);
  }
  .arrow {
    color: var(--muted);
  }
  input.expected {
    font-size: 0.9rem;
    color: var(--muted);
  }
  input.expected:focus {
    color: var(--text);
  }
  .adm select {
    width: 6.5rem;
    flex: none;
    font-size: 0.85rem;
    padding: 0.15rem 0.3rem;
  }
  .adm.level-warning {
    border-left: 3px solid var(--danger);
    padding-left: 0.3rem;
  }
  .adm.level-caution {
    border-left: 3px solid var(--warn);
    padding-left: 0.3rem;
  }
  .adm.level-note {
    border-left: 3px solid var(--border);
    padding-left: 0.3rem;
  }
  .figs {
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
    padding-left: 0.4rem;
  }
  .fig {
    position: relative;
    display: inline-grid;
    place-items: center;
    width: 5.5rem;
    height: 4rem;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }
  .fig img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
  .fig .x {
    position: absolute;
    top: 0;
    right: 0;
  }
  .nofig {
    padding: 0.2rem;
    text-align: center;
    word-break: break-all;
  }
  .answers {
    display: grid;
    gap: 0.2rem;
    padding: 0.2rem 0 0 1.2rem;
    justify-items: start;
  }
  .answer {
    width: 100%;
  }
  .answer :global(select) {
    width: auto;
    max-width: 16rem;
    font-size: 0.85rem;
    padding: 0.15rem 0.3rem;
  }
  .branches {
    color: var(--muted);
    padding-left: 0.4rem;
  }
  .inline-tools {
    gap: 0.6rem;
  }
  .tools {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    opacity: 0;
  }
  .step:hover .tools,
  .step.selected .tools,
  .step:focus-within .tools {
    opacity: 1;
  }
  .mini,
  .x {
    font: inherit;
    font-size: 0.85rem;
    color: var(--muted);
    background: none;
    border: none;
    cursor: pointer;
    padding: 0 0.3rem;
    line-height: 1.4;
  }
  .mini:hover,
  .x:hover {
    color: var(--text);
  }
  .mini.danger:hover,
  .x:hover {
    color: var(--danger);
  }
  .mini:disabled {
    opacity: 0.3;
    cursor: default;
  }
</style>
