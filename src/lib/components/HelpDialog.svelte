<!--
  ヘルプ: editor 自身の使い方を、体験型マニュアル（static/help/help.manual.json。scripts/make-help.mjs が editor の画面から生成）として
  player の外枠（Frame、P-0）で見せる。「例として開く」で同じ JSON を editor に読み込み、作り方の見本として中身を見られる。
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { Manual } from '@shuji-bonji/experiential-manual-model';
  import { Frame } from '@shuji-bonji/experiential-manual-player/components';
  import { base } from '$app/paths';
  import { editor } from '$lib/state.svelte';
  import { t } from '$lib/i18n';

  let { onclose }: { onclose: () => void } = $props();

  const url = new URL(`${base}/help/help.manual.json`, location.href).href;
  let dialog = $state<HTMLDialogElement | undefined>();
  let manual = $state<Manual | undefined>();
  let error = $state<string | undefined>();
  let hints = $state(true);

  onMount(async () => {
    dialog?.showModal();
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      manual = (await res.json()) as Manual;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  });

  function close() {
    dialog?.close();
    onclose();
  }

  async function openAsExample() {
    if (editor.dirty && !confirm(t('file.confirmDiscard'))) return;
    close();
    await editor.openFromUrl(url, 'help.manual.json', t('help.openedNote'));
  }
</script>

<dialog bind:this={dialog} class="help" onclose={onclose} oncancel={(e) => (e.preventDefault(), close())} aria-label={t('help.title')} data-testid="help-dialog">
  <div class="row spread head">
    <strong>{t('help.title')}</strong>
    <div class="row">
      <button type="button" class="btn small" onclick={openAsExample} data-testid="help-open-example">{t('help.openAsExample')}</button>
      <button type="button" class="btn small" onclick={close} aria-label={t('common.close')}>×</button>
    </div>
  </div>
  <div class="body em-root">
    {#if error}
      <p class="muted">{t('help.loadFailed', { reason: error })}</p>
    {:else if manual}
      <Frame {manual} baseUrl={url} bind:hints lang="ja" />
    {:else}
      <p class="muted small">{t('help.loading')}</p>
    {/if}
  </div>
</dialog>

<style>
  .help {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--text);
    padding: 0;
    width: min(96vw, 1500px);
    height: 92vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .help::backdrop {
    background: rgb(0 0 0 / 0.45);
  }
  .head {
    padding: 0.5rem var(--gap);
    border-bottom: 1px solid var(--border);
  }
  .body {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 0.5rem var(--gap) var(--gap);
  }
  /* player の色トークンを editor のトークンに合わせる（+page.svelte の体験と同じ） */
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
</style>
