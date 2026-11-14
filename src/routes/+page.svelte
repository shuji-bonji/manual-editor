<!--
  E-0 共通の枠: 上の帯（TopBar）、左の構成ツリー、中央のステージ（編集 | 体験）、右のインスペクター、下の引き出し。
  中央は Topic の kind と editor.mode で切り替える。
  - screenFlow: 編集は EditStage（player の Stage の上に作図を重ねる）、体験は player の ScreenFlow をそのまま置く。
    体験中に画面が変わると selection.screenId を追いかけるので、編集に戻すとその画面が選ばれている。
  - procedure / troubleshooting / description: 編集は試作の ProcedureEditor / DescriptionEditor（E-2〜E-4 で組み直す）、体験は player の TopicView。
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { ScreenFlow, TopicView } from '@shuji-bonji/experiential-manual-player/components';
  import type { Target } from '@shuji-bonji/experiential-manual-player/runtime';
  import { editor } from '$lib/state.svelte';
  import { t } from '$lib/i18n';
  import TopBar from '$lib/components/TopBar.svelte';
  import StructureTree from '$lib/components/StructureTree.svelte';
  import EditStage from '$lib/components/EditStage.svelte';
  import Inspector from '$lib/components/Inspector.svelte';
  import Drawer from '$lib/components/Drawer.svelte';
  import ProcedureEditor from '$lib/components/ProcedureEditor.svelte';
  import DescriptionEditor from '$lib/components/DescriptionEditor.svelte';

  let ready = $state(false);

  onMount(async () => {
    await editor.init();
    ready = true;
  });

  // 編集した内容を、少し待ってから作業場所（ブラウザーの中のフォルダー）の manual.json に書く
  $effect(() => {
    void editor.manual;
    if (!ready) return;
    const id = setTimeout(() => editor.autosave(), 800);
    return () => clearTimeout(id);
  });

  // 画面を閉じる前の確認。作業場所が残るブラウザーでは、閉じても続きから始められるので尋ねない
  $effect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (editor.dirty && !editor.persistent) e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  });

  // 最初の Topic を選んでおく（マニュアル自体や素材を選んでいるときは変えない）
  $effect(() => {
    const s = editor.selection;
    if (!s.topicId && editor.manual.topics.length > 0) {
      const first = editor.manual.topics[0];
      editor.select({ ...s, topicId: first.id, screenId: first.screens?.length ? (first.startScreenRef ?? first.screens[0].id) : undefined });
    }
  });

  /** クリップボードの画像（スクリーンショット）を受け取る（E-6）。文字を入力中の欄では、ブラウザー標準の貼り付けに任せる */
  async function onPaste(e: ClipboardEvent) {
    const target = e.target as HTMLElement | null;
    if (target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable)) return;
    const items = [...(e.clipboardData?.items ?? [])];
    const image = items.find((x) => x.kind === 'file' && x.type.startsWith('image/'));
    const file = image?.getAsFile();
    if (!file) return;
    e.preventDefault();
    await editor.pasteImage(file);
  }

  const topic = $derived(editor.topic);

  function resolveAsset(ref: string) {
    const url = editor.images.get(ref);
    const s = editor.sizes.get(ref);
    return { url, width: s?.w, height: s?.h };
  }

  /** 体験中に別の Topic の手順や画面へ行くとき */
  function leave(target: Target) {
    editor.select(target.kind === 'screen' ? { topicId: target.topic.id, screenId: target.screen.id } : { topicId: target.topic.id, stepId: target.step.id });
  }

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
<svelte:window onkeydown={onKey} onpaste={onPaste} />

<div class="app">
  <TopBar />

  {#each editor.notices as n (n.id)}
    <div class="banner {n.kind}" role={n.kind === 'error' ? 'alert' : 'status'}>
      <span>{n.text}</span>
      <button class="btn small" type="button" onclick={() => editor.dismiss(n.id)}>{t('common.close')}</button>
    </div>
  {/each}

  <div class="columns">
    <aside class="col tree"><StructureTree /></aside>

    <main class="col center" aria-label={t('screen.editorLabel')}>
      {#if !topic}
        <div class="panel muted">{t('edit.noTopic')}</div>
      {:else if topic.kind === 'screenFlow'}
        {#if editor.mode === 'edit'}
          <EditStage {topic} />
        {:else}
          {#key topic.id}
            <div class="play em-root" data-testid="play">
              <ScreenFlow
                manual={editor.manual}
                topicId={topic.id}
                startScreen={editor.selection.screenId}
                {resolveAsset}
                onchange={(s) => editor.select({ topicId: topic.id, screenId: s.screen?.id })}
                onleave={leave}
              />
            </div>
          {/key}
        {/if}
      {:else if editor.mode === 'play'}
        {#key topic.id}
          <div class="play em-root" data-testid="play">
            <TopicView manual={editor.manual} {topic} startStep={editor.selection.stepId} onleave={leave} />
          </div>
        {/key}
      {:else}
        <h2 class="topic-title">{topic.title} <span class="badge">{t(`kind.${topic.kind}`)}</span></h2>
        {#if topic.kind === 'description'}
          <DescriptionEditor {topic} />
        {:else}
          <ProcedureEditor {topic} />
        {/if}
      {/if}
    </main>

    <aside class="col right"><Inspector /></aside>
  </div>

  <Drawer />
</div>

<style>
  /* 画面全体を 1 画面に収め、3 列はそれぞれの中でスクロールする。下の引き出し（素材・地図・検査）が常に見える */
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    height: 100dvh;
  }
  .columns {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(13rem, 17rem) minmax(0, 1fr) minmax(16rem, 20rem);
    gap: 0;
    align-items: stretch;
  }
  @media (max-width: 1000px) {
    .app {
      height: auto;
      min-height: 100vh;
    }
    .columns {
      grid-template-columns: minmax(0, 1fr);
    }
    .columns .col {
      overflow: visible;
    }
    .col.tree,
    .col.right {
      border: none !important;
      border-bottom: 1px solid var(--border) !important;
    }
  }
  .col {
    padding: var(--gap);
    min-width: 0;
    min-height: 0;
    overflow: auto;
  }
  .col.tree {
    border-right: 1px solid var(--border);
    background: var(--surface);
  }
  .col.right {
    border-left: 1px solid var(--border);
    background: var(--surface);
  }
  .play {
    padding: 0.5rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
  }
  /* player の色トークンを editor のトークンに合わせる */
  .em-root {
    --em-bg: var(--bg);
    --em-surface: var(--surface);
    --em-surface-2: var(--surface-2);
    --em-text: var(--text);
    --em-muted: var(--muted);
    --em-border: var(--border);
    --em-accent: var(--accent);
    --em-accent-soft: var(--accent-soft);
    --em-danger-soft: var(--danger-soft);
    --em-warn: var(--warn);
    --em-warn-soft: var(--warn-soft);
    --em-hotspot-fill: var(--hotspot-fill);
    --em-hotspot-stroke: var(--hotspot-stroke);
    --em-hotspot-selected: var(--hotspot-selected);
    --em-radius: var(--radius);
    --em-font: var(--font);
  }
  .topic-title {
    font-size: 1.15rem;
    margin: 0 0 var(--gap);
  }
  .banner {
    display: flex;
    gap: 1rem;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    padding: 0.5rem 0.75rem;
    margin: 0.5rem var(--gap) 0;
    border-radius: var(--radius);
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
