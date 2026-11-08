<!--
  E-0 の構成ツリー: 先頭に「マニュアル」（題名・版・適用範囲をインスペクターで編集する）、その下に Topic › 画面（または手順）の 2 段。
  印: ● 開始画面、⚠ 問題あり、◀ 選択中。ツリー・ステージ・インスペクターの選択は editor.selection の 1 つを指す。
  並べ替えは ↑↓（ドラッグは後の版）。Topic の題名・種類の編集はインスペクターで行う。
-->
<script lang="ts">
  import type { TopicKind } from '@shuji-bonji/experiential-manual-model';
  import { editor } from '$lib/state.svelte';
  import { flattenSteps, moveScreen, moveTopic } from '$lib/ops';
  import { locateIssue } from '$lib/issues';
  import { t } from '$lib/i18n';

  const kinds: TopicKind[] = ['screenFlow', 'procedure', 'description', 'troubleshooting'];
  const marks: Record<TopicKind, string> = { screenFlow: '▣', procedure: '≡', description: '¶', troubleshooting: '?' };
  let newKind = $state<TopicKind>('screenFlow');
  let fileInput: HTMLInputElement | undefined = $state();
  /** 畳んだ Topic の id */
  let collapsed = $state(new Set<string>());

  const sel = $derived(editor.selection);
  /** マニュアル自体や素材を選んでいるときは、Topic・画面・手順の行に選択の印を付けない */
  const plain = $derived(!sel.root && !sel.assetId);

  /** 問題のある Topic・画面・手順の id */
  const flagged = $derived.by(() => {
    const topics = new Set<string>();
    const screens = new Set<string>();
    const steps = new Set<string>();
    for (const issue of [...editor.validation.errors, ...editor.validation.warnings]) {
      const loc = locateIssue(editor.manual, issue.path, issue.message);
      if (loc.topicId) topics.add(loc.topicId);
      if (loc.screenId) screens.add(loc.screenId);
      if (loc.stepId) steps.add(loc.stepId);
    }
    return { topics, screens, steps };
  });

  function toggle(id: string) {
    const next = new Set(collapsed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    collapsed = next;
  }

  async function onFiles(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = '';
    if (sel.topicId) await editor.addScreensFromFiles(sel.topicId, files);
  }

  function addBlank() {
    if (!sel.topicId) return;
    const id = editor.addBlankScreen(sel.topicId);
    if (id) editor.select({ topicId: sel.topicId, screenId: id });
  }
</script>

<nav class="tree" aria-label={t('tree.heading')}>
  <h2>{t('tree.heading')}</h2>
  <div class="row-item root" class:selected={sel.root === true}>
    <button type="button" class="label" onclick={() => editor.selectRoot()} data-testid="tree-root" title={t('tree.rootHelp')}>
      <span class="mark">▤</span>
      <span class="text">{editor.manual.title || t('tree.root')}</span>
      <span class="muted small">{t('tree.root')}</span>
    </button>
  </div>
  {#if editor.manual.topics.length === 0}
    <p class="muted small">{t('topic.empty')}</p>
  {/if}
  <ul class="topics">
    {#each editor.manual.topics as topic, i (topic.id)}
      {@const open = !collapsed.has(topic.id)}
      {@const isTopic = sel.topicId === topic.id}
      <li>
        <div class="row-item topic" class:selected={plain && isTopic && !sel.screenId && !sel.stepId} class:in={isTopic}>
          <button type="button" class="twisty" aria-expanded={open} onclick={() => toggle(topic.id)} aria-label={topic.title}>{open ? '▾' : '▸'}</button>
          <button type="button" class="label" onclick={() => editor.select({ topicId: topic.id })} data-testid="tree-topic">
            <span class="mark" title={t(`kind.${topic.kind}`)}>{marks[topic.kind]}</span>
            <span class="text">{topic.title}</span>
            {#if flagged.topics.has(topic.id)}<span class="flag" title={t('tree.issue')}>⚠</span>{/if}
          </button>
          {#if isTopic}
            <span class="actions">
              <button type="button" class="mini" disabled={i === 0} onclick={() => editor.apply((m) => moveTopic(m, topic.id, -1))} aria-label={t('common.up')}>↑</button>
              <button type="button" class="mini" disabled={i === editor.manual.topics.length - 1} onclick={() => editor.apply((m) => moveTopic(m, topic.id, 1))} aria-label={t('common.down')}>↓</button>
            </span>
          {/if}
        </div>
        {#if open}
          {#if topic.kind === 'screenFlow'}
            {@const screens = topic.screens ?? []}
            <ul class="children">
              {#each screens as s, j (s.id)}
                {@const isScreen = isTopic && sel.screenId === s.id}
                <li class="row-item child" class:selected={plain && isScreen}>
                  <button type="button" class="label" onclick={() => editor.select({ topicId: topic.id, screenId: s.id })} data-testid="tree-screen">
                    <span class="text">{s.caption || s.id}</span>
                    {#if s.id === topic.startScreenRef}<span class="start" title={t('tree.start')}>●</span>{/if}
                    {#if flagged.screens.has(s.id)}<span class="flag" title={t('tree.issue')}>⚠</span>{/if}
                    <span class="muted small">{t('screen.hotspotCount', { n: s.hotspots.length })}</span>
                  </button>
                  {#if isScreen}
                    <span class="actions">
                      <button type="button" class="mini" disabled={j === 0} onclick={() => editor.apply((m) => moveScreen(m, topic.id, s.id, -1))} aria-label={t('common.up')}>↑</button>
                      <button type="button" class="mini" disabled={j === screens.length - 1} onclick={() => editor.apply((m) => moveScreen(m, topic.id, s.id, 1))} aria-label={t('common.down')}>↓</button>
                    </span>
                  {/if}
                </li>
              {/each}
              {#if isTopic}
                <li class="add">
                  <input bind:this={fileInput} class="sr-only" type="file" accept="image/*" multiple onchange={onFiles} data-testid="add-screen-input" />
                  <button type="button" class="btn small" onclick={() => fileInput?.click()}>{t('screen.add')}</button>
                  <button type="button" class="btn small" onclick={addBlank} data-testid="add-screen-blank">{t('tree.addScreenBlank')}</button>
                </li>
              {/if}
            </ul>
          {:else if topic.kind === 'procedure' || topic.kind === 'troubleshooting'}
            <ul class="children">
              {#each flattenSteps(topic.steps) as { step, depth } (step.id)}
                <li class="row-item child depth-{Math.min(depth, 3)}" class:selected={plain && isTopic && sel.stepId === step.id}>
                  <button type="button" class="label" onclick={() => editor.select({ topicId: topic.id, stepId: step.id })}>
                    <span class="text">{step.text || step.id}</span>
                    {#if flagged.steps.has(step.id)}<span class="flag" title={t('tree.issue')}>⚠</span>{/if}
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
        {/if}
      </li>
    {/each}
  </ul>

  <div class="row add-topic">
    <select bind:value={newKind} aria-label={t('topic.newKind')}>
      {#each kinds as k (k)}
        <option value={k}>{t(`kind.${k}`)}</option>
      {/each}
    </select>
    <button class="btn small primary" type="button" onclick={() => editor.createTopic(newKind)} data-testid="add-topic">{t('topic.add')}</button>
  </div>
</nav>

<style>
  .tree {
    font-size: 0.9rem;
  }
  h2 {
    font-size: 0.8rem;
    color: var(--muted);
    margin: 0 0 0.4rem;
    text-transform: none;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .children {
    margin-left: 1.1rem;
    border-left: 1px solid var(--border);
    padding-left: 0.3rem;
  }
  .row-item {
    display: flex;
    align-items: center;
    gap: 0.2rem;
    border-radius: var(--radius);
    padding-right: 0.2rem;
  }
  .row-item.in > .label {
    font-weight: 600;
  }
  .row-item.root {
    margin-bottom: 0.3rem;
    border-bottom: 1px solid var(--border);
    border-radius: 0;
    padding-bottom: 0.2rem;
  }
  .row-item.root .label {
    font-weight: 600;
  }
  .row-item.selected {
    background: var(--accent-soft);
  }
  .row-item.selected > .label::after {
    content: '◀';
    color: var(--accent);
    font-size: 0.7rem;
    margin-left: auto;
  }
  .twisty,
  .label,
  .mini {
    font: inherit;
    color: inherit;
    background: none;
    border: none;
    cursor: pointer;
  }
  .twisty {
    width: 1.2rem;
    color: var(--muted);
    padding: 0.2rem 0;
  }
  .label {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.25rem 0.3rem;
    text-align: left;
  }
  .text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mark {
    width: 1.1em;
    text-align: center;
    color: var(--muted);
    font-size: 0.85em;
  }
  .start {
    color: var(--ok);
    font-size: 0.7rem;
  }
  .flag {
    color: var(--warn);
  }
  .child.depth-1 {
    margin-left: 0.8rem;
  }
  .child.depth-2 {
    margin-left: 1.6rem;
  }
  .child.depth-3 {
    margin-left: 2.4rem;
  }
  .actions {
    display: flex;
    gap: 0.1rem;
  }
  .mini {
    padding: 0 0.3rem;
    color: var(--muted);
  }
  .mini:disabled {
    opacity: 0.3;
    cursor: default;
  }
  .add {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    padding: 0.3rem;
  }
  .add-topic {
    margin-top: 0.6rem;
  }
  .add-topic select {
    flex: 1;
    width: auto;
  }
</style>
