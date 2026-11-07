<script lang="ts">
  import { onMount } from 'svelte';
  import { editor, type Tab } from '$lib/state.svelte';
  import { t } from '$lib/i18n';
  import FileBar from '$lib/components/FileBar.svelte';
  import TopicList from '$lib/components/TopicList.svelte';
  import ScreenEditor from '$lib/components/ScreenEditor.svelte';
  import ProcedureEditor from '$lib/components/ProcedureEditor.svelte';
  import DescriptionEditor from '$lib/components/DescriptionEditor.svelte';
  import LibraryPanel from '$lib/components/LibraryPanel.svelte';
  import IssuesPanel from '$lib/components/IssuesPanel.svelte';
  import Player from '$lib/components/Player.svelte';

  let ready = $state(false);

  onMount(() => {
    editor.init();
    ready = true;
  });

  // 編集した内容を、少し待ってから下書きとして localStorage に保存する
  $effect(() => {
    void editor.manual;
    if (!ready) return;
    const id = setTimeout(() => editor.autosave(), 800);
    return () => clearTimeout(id);
  });

  // 画面を閉じる前の確認（未保存の変更があるとき）
  $effect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (editor.dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  });

  // 最初の Topic を選んでおく
  $effect(() => {
    if (!editor.selection.topicId && editor.manual.topics.length > 0) editor.selectTopic(editor.manual.topics[0].id);
  });

  const tabs: Tab[] = ['edit', 'library', 'check', 'play'];
  const topic = $derived(editor.topic);

  function onKey(e: KeyboardEvent) {
    const mod = e.metaKey || e.ctrlKey;
    if (!mod) return;
    const target = e.target as HTMLElement | null;
    // 文字を入力中の欄では、ブラウザー標準の取り消しに任せる
    if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;
    if (e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      editor.undo();
    } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
      e.preventDefault();
      editor.redo();
    }
  }
</script>

<svelte:head>
  <title>{t('app.title')}</title>
</svelte:head>
<svelte:window onkeydown={onKey} />

<FileBar />

<main>
  {#if editor.pendingDraft}
    <div class="banner" role="alert" data-testid="draft-banner">
      <span>{t('draft.found', { time: new Date(editor.pendingDraft.savedAt).toLocaleString('ja-JP') })}</span>
      <span class="row">
        <button class="btn small primary" type="button" onclick={() => editor.restoreDraft()}>{t('draft.restore')}</button>
        <button class="btn small" type="button" onclick={() => editor.discardDraft()}>{t('draft.discard')}</button>
      </span>
    </div>
  {/if}

  {#each editor.notices as n (n.id)}
    <div class="banner {n.kind}" role={n.kind === 'error' ? 'alert' : 'status'}>
      <span>{n.text}</span>
      <button class="btn small" type="button" onclick={() => editor.dismiss(n.id)}>{t('common.close')}</button>
    </div>
  {/each}

  <div class="layout">
    <aside class="side">
      <TopicList />
    </aside>

    <div class="content">
      <div class="tabs" role="tablist" aria-label={t('tabs.label')}>
        {#each tabs as tab (tab)}
          <button
            role="tab"
            type="button"
            class="tab"
            aria-selected={editor.tab === tab}
            data-testid="tab-{tab}"
            onclick={() => (editor.tab = tab)}
          >
            {t(`tab.${tab}`)}
            {#if tab === 'check'}
              {#if editor.validation.errors.length > 0}<span class="badge err">{editor.validation.errors.length}</span>{/if}
              {#if editor.validation.warnings.length > 0}<span class="badge warn">{editor.validation.warnings.length}</span>{/if}
            {/if}
          </button>
        {/each}
      </div>

      <div class="tabpanel" role="tabpanel">
        {#if editor.tab === 'edit'}
          {#if !topic}
            <div class="panel muted">{t('edit.noTopic')}</div>
          {:else}
            <h2 class="topic-title">{topic.title} <span class="badge">{t(`kind.${topic.kind}`)}</span></h2>
            {#if topic.kind === 'screenFlow'}
              <div class="topic-meta"><DescriptionEditor {topic} compact /></div>
              <ScreenEditor {topic} />
            {:else if topic.kind === 'description'}
              <DescriptionEditor {topic} />
            {:else}
              <ProcedureEditor {topic} />
            {/if}
          {/if}
        {:else if editor.tab === 'library'}
          <LibraryPanel />
        {:else if editor.tab === 'check'}
          <IssuesPanel />
        {:else}
          <Player />
        {/if}
      </div>
    </div>
  </div>
</main>

<style>
  main {
    padding: var(--gap);
    max-width: 90rem;
    margin: 0 auto;
  }
  .layout {
    display: grid;
    grid-template-columns: minmax(15rem, 20rem) 1fr;
    gap: var(--gap);
    align-items: start;
  }
  @media (max-width: 900px) {
    .layout {
      grid-template-columns: 1fr;
    }
  }
  .content {
    min-width: 0;
  }
  .tabs {
    display: flex;
    gap: 0.25rem;
    border-bottom: 1px solid var(--border);
    margin-bottom: var(--gap);
    flex-wrap: wrap;
  }
  .tab {
    padding: 0.4rem 0.9rem;
    border: 1px solid transparent;
    border-bottom: 0;
    border-radius: var(--radius) var(--radius) 0 0;
    background: none;
    cursor: pointer;
    display: inline-flex;
    gap: 0.3rem;
    align-items: center;
  }
  .tab[aria-selected='true'] {
    background: var(--surface);
    border-color: var(--border);
    font-weight: 600;
    margin-bottom: -1px;
    border-bottom: 1px solid var(--surface);
  }
  .topic-meta {
    margin-bottom: var(--gap);
  }
  .topic-title {
    font-size: 1.15rem;
  }
  .banner {
    display: flex;
    gap: 1rem;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    padding: 0.5rem 0.75rem;
    border-radius: var(--radius);
    margin-bottom: 0.5rem;
    background: var(--accent-soft);
    border: 1px solid var(--accent);
  }
  .banner.warn {
    background: var(--warn-soft);
    border-color: var(--warn);
  }
  .banner.error {
    background: var(--danger-soft);
    border-color: var(--danger);
  }
</style>
