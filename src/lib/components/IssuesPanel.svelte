<!--
  E-7 検査（下の引き出し）: validateManual の結果（errors / warnings）を一覧にし、行を押すと該当の Topic・画面・ホットスポット・手順・素材を選ぶ。
  場所は「Topic › 画面 › ホットスポット」のように名前で出し、文はよく出るものを日本語にする（lib/issues.ts）。
  検査は editor.validation（$derived）で常に最新。保存のたびに errors があれば state.svelte.ts が通知で知らせる（保存は止めない）。
-->
<script lang="ts">
  import { editor } from '$lib/state.svelte';
  import { toIssueRows, type IssueRow } from '$lib/issues';
  import { dropBrokenTransitions } from '$lib/ops';
  import { t } from '$lib/i18n';

  type Filter = 'all' | 'errors' | 'warnings';
  let filter = $state<Filter>('all');
  let showRaw = $state(false);

  const v = $derived(editor.validation);
  const rows = $derived.by(() => {
    const m = editor.manual;
    const errs = toIssueRows(m, v.errors, 'err');
    const warns = toIssueRows(m, v.warnings, 'warn');
    return filter === 'errors' ? errs : filter === 'warnings' ? warns : [...errs, ...warns];
  });

  /** Topic ごと（素材・マニュアルはそれぞれ 1 つの組）にまとめる */
  const groups = $derived.by(() => {
    const map = new Map<string, { title: string; rows: IssueRow[] }>();
    for (const r of rows) {
      const key = r.loc.area === 'topic' ? `topic:${r.loc.topicId}` : r.loc.area;
      const title = r.loc.area === 'topic' ? (editor.manual.topics.find((x) => x.id === r.loc.topicId)?.title ?? r.loc.topicId ?? '') : t(`check.where.${r.loc.area}`);
      (map.get(key) ?? map.set(key, { title, rows: [] }).get(key)!).rows.push(r);
    }
    return [...map.values()];
  });

  function go(r: IssueRow) {
    const loc = r.loc;
    if (loc.area === 'assets') {
      editor.drawer = 'assets';
      if (loc.assetId) editor.selectAsset(loc.assetId);
      return;
    }
    if (loc.area === 'manual' || !loc.topicId) {
      editor.selectRoot();
      return;
    }
    editor.select({ topicId: loc.topicId, screenId: loc.screenId, hotspotId: loc.hotspotId, stepId: loc.stepId });
    if (!loc.screenId && !loc.stepId) editor.fixSelection();
    editor.mode = 'edit';
  }

  function showOnMap(r: IssueRow) {
    go(r);
    editor.drawer = 'map';
  }

  function dropBroken() {
    let n = 0;
    editor.apply((m) => {
      const r = dropBrokenTransitions(m);
      n = r.dropped;
      return r.manual;
    });
    editor.notify('info', t('check.dropped', { n }));
  }

  const hasBroken = $derived(v.errors.some((e) => e.message.startsWith('transition target')));
</script>

<div class="stack" data-testid="issues-panel">
  <section class="panel head" aria-live="polite">
    <div class="row spread">
      <h2>{t('check.heading')}</h2>
      {#if v.ok && v.warnings.length === 0}
        <span class="badge ok" data-testid="check-clear">{t('check.allClear')}</span>
      {:else}
        <div class="filters" role="group" aria-label={t('assets.filterLabel')}>
          <button type="button" class:on={filter === 'all'} aria-pressed={filter === 'all'} onclick={() => (filter = 'all')}>{t('check.filter.all', { n: v.errors.length + v.warnings.length })}</button>
          <button type="button" class="err" class:on={filter === 'errors'} aria-pressed={filter === 'errors'} onclick={() => (filter = 'errors')}>{t('check.filter.errors', { n: v.errors.length })}</button>
          <button type="button" class="warn" class:on={filter === 'warnings'} aria-pressed={filter === 'warnings'} onclick={() => (filter = 'warnings')}>{t('check.filter.warnings', { n: v.warnings.length })}</button>
        </div>
      {/if}
    </div>
    <p class="muted small">{t('check.help')}</p>
    <div class="row">
      {#if hasBroken}
        <button class="btn small" type="button" onclick={dropBroken}>{t('check.dropBroken')}</button>
      {/if}
      <label class="small muted raw"><input type="checkbox" bind:checked={showRaw} /> {t('check.showRaw')}</label>
    </div>
  </section>

  {#each groups as g (g.title)}
    <section class="group" aria-label={g.title}>
      <h3>{g.title} <span class="muted small">({g.rows.length})</span></h3>
      <ul class="list">
        {#each g.rows as r, i (r.kind + i)}
          <li>
            <div class="issue">
              <button class="main" type="button" onclick={() => go(r)} data-testid="issue-{r.kind}">
                <span class="badge {r.kind}">{r.kind === 'err' ? t('check.error') : t('check.warning')}</span>
                <span class="body">
                  <span class="crumbs">{r.crumbs.slice(1).join(' › ')}</span>
                  <span class="msg">{r.text}</span>
                  {#if showRaw}<code class="path">{r.issue.path || '/'} — {r.issue.message}</code>{/if}
                </span>
              </button>
              {#if r.mappable}
                <button class="btn small" type="button" onclick={() => showOnMap(r)} data-testid="issue-map">{t('check.showMap')}</button>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    </section>
  {/each}
</div>

<style>
  .head h2 {
    margin: 0;
  }
  .filters {
    display: inline-flex;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }
  .filters button {
    font: inherit;
    font-size: 0.8rem;
    color: inherit;
    background: none;
    border: none;
    padding: 0.25rem 0.6rem;
    cursor: pointer;
  }
  .filters button + button {
    border-left: 1px solid var(--border);
  }
  .filters button.on {
    background: var(--surface-2);
    font-weight: 600;
  }
  .filters button.err:not(.on) {
    color: var(--danger);
  }
  .filters button.warn:not(.on) {
    color: var(--warn);
  }
  .raw {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    cursor: pointer;
  }
  .group h3 {
    font-size: 0.85rem;
    margin: 0.4rem 0 0.2rem;
    color: var(--muted);
  }
  .issue {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
  .main {
    display: flex;
    gap: 0.5rem;
    align-items: flex-start;
    flex: 1;
    min-width: 0;
    text-align: left;
    border: 0;
    background: none;
    padding: 0.4rem 0.6rem;
    cursor: pointer;
    font: inherit;
    color: inherit;
    border-radius: var(--radius);
  }
  .main:hover {
    background: var(--surface-2);
  }
  .body {
    display: grid;
    gap: 0.1rem;
    min-width: 0;
  }
  .crumbs {
    font-size: 0.8rem;
    color: var(--muted);
  }
  .crumbs:empty {
    display: none;
  }
  .msg {
    font-size: 0.9rem;
  }
  .path {
    color: var(--muted);
    font-size: 0.75rem;
    word-break: break-all;
  }
  .badge.ok {
    background: var(--ok-soft);
    color: var(--ok);
    border-color: var(--ok);
  }
</style>
