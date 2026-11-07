<!-- 検査: validateManual の結果（errors / warnings）を一覧にし、押すと該当の場所へ移る -->
<script lang="ts">
  import type { ValidationIssue } from '@shuji-bonji/experiential-manual-model';
  import { editor } from '$lib/state.svelte';
  import { locateIssue } from '$lib/issues';
  import { dropBrokenTransitions } from '$lib/ops';
  import { t } from '$lib/i18n';

  const v = $derived(editor.validation);

  function go(issue: ValidationIssue) {
    const loc = locateIssue(editor.manual, issue.path);
    if (loc.area === 'library' || !loc.topicId) {
      editor.tab = 'library';
      return;
    }
    editor.select({ topicId: loc.topicId, screenId: loc.screenId, hotspotId: loc.hotspotId, stepId: loc.stepId });
    if (!loc.screenId) editor.fixSelection();
    editor.tab = 'edit';
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

{#snippet issueList(items: ValidationIssue[], kind: 'err' | 'warn')}
  <ul class="list">
    {#each items as issue, i (kind + i)}
      <li>
        <button class="issue" type="button" onclick={() => go(issue)} data-testid="issue-{kind}">
          <span class="badge {kind}">{kind === 'err' ? t('check.error') : t('check.warning')}</span>
          <span class="msg">{issue.message}</span>
          <code class="path">{issue.path || '/'}</code>
        </button>
      </li>
    {/each}
  </ul>
{/snippet}

<div class="stack">
  <section class="panel" aria-live="polite">
    <div class="row spread">
      <h2>{t('check.heading')}</h2>
      {#if v.ok && v.warnings.length === 0}
        <span class="badge ok">{t('check.allClear')}</span>
      {:else}
        <span>
          <span class="badge err">{t('check.errorCount', { n: v.errors.length })}</span>
          <span class="badge warn">{t('check.warningCount', { n: v.warnings.length })}</span>
        </span>
      {/if}
    </div>
    <p class="muted small">{t('check.help')}</p>
    {#if hasBroken}
      <button class="btn small" type="button" onclick={dropBroken}>{t('check.dropBroken')}</button>
    {/if}
  </section>

  {#if v.errors.length > 0}
    <section aria-label={t('check.error')}>{@render issueList(v.errors, 'err')}</section>
  {/if}
  {#if v.warnings.length > 0}
    <section aria-label={t('check.warning')}>{@render issueList(v.warnings, 'warn')}</section>
  {/if}
</div>

<style>
  .issue {
    display: flex;
    gap: 0.5rem;
    align-items: baseline;
    flex-wrap: wrap;
    width: 100%;
    text-align: left;
    border: 0;
    background: none;
    padding: 0.4rem 0.6rem;
    cursor: pointer;
  }
  .issue:hover {
    background: var(--surface-2);
  }
  .msg {
    flex: 1 1 14rem;
  }
  .path {
    color: var(--muted);
    font-size: 0.8rem;
    word-break: break-all;
  }
  .badge.ok {
    background: var(--ok-soft);
    color: var(--ok);
    border-color: var(--ok);
  }
</style>
