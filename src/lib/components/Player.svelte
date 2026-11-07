<!--
  体験表示: screenFlow の Topic を、開始画面から、ホットスポットを押して遷移先へ進む形で試す。
  遷移先が別の Topic の画面でも追いかける。戻る（履歴を 1 つ戻す）と最初から（開始画面に戻す）がある。
-->
<script lang="ts">
  import { editor } from '$lib/state.svelte';
  import { findScreen } from '$lib/ops';
  import { t } from '$lib/i18n';
  import type { Hotspot } from '@shuji-bonji/experiential-manual-model';
  import HotspotCanvas from './HotspotCanvas.svelte';

  const flows = $derived(editor.manual.topics.filter((x) => x.kind === 'screenFlow' && (x.screens?.length ?? 0) > 0));

  /** 最初に表示する Topic（選択）。以降の遷移は Topic をまたいでもよいので、画面の id の履歴（trail）で持つ */
  let startTopicId = $state<string | undefined>();
  let trail = $state<string[]>([]);
  let message = $state('');
  let showHints = $state(false);

  const startTopic = $derived(flows.find((x) => x.id === startTopicId) ?? flows[0]);
  const startId = $derived(startTopic ? (startTopic.startScreenRef ?? startTopic.screens?.[0]?.id) : undefined);
  const currentId = $derived(trail.at(-1) ?? startId);
  // 編集で画面が消えた場合は、開始画面に戻して表示する
  const found = $derived(
    (currentId ? findScreen(editor.manual, currentId) : undefined) ?? (startId ? findScreen(editor.manual, startId) : undefined)
  );
  const screen = $derived(found?.screen);
  const url = $derived(screen ? editor.images.get(screen.assetRef) : undefined);
  const size = $derived(screen ? editor.sizes.get(screen.assetRef) : undefined);

  function chooseTopic(id: string) {
    startTopicId = id;
    trail = [];
    message = '';
  }

  function press(h: Hotspot) {
    if (!h.transition) {
      message = t('play.noTransition', { label: h.label || h.id });
      return;
    }
    const to = findScreen(editor.manual, h.transition.to);
    if (!to) {
      message = t('play.notScreen', { to: h.transition.to });
      return;
    }
    trail = [...trail, to.screen.id];
    message = h.transition.condition ? t('play.condition', { text: h.transition.condition }) : '';
  }

  function back() {
    trail = trail.slice(0, -1);
    message = '';
  }
  function restart() {
    trail = [];
    message = '';
  }
</script>

{#if flows.length === 0}
  <div class="panel muted">{t('play.noFlow')}</div>
{:else}
  <div class="stack">
    <div class="panel row spread">
      <label class="row">
        <span>{t('play.topic')}</span>
        <select value={startTopic?.id} onchange={(e) => chooseTopic(e.currentTarget.value)} style="width:auto" data-testid="play-topic">
          {#each flows as f (f.id)}
            <option value={f.id}>{f.title}</option>
          {/each}
        </select>
      </label>
      <div class="row">
        <button class="btn small" type="button" disabled={trail.length === 0} onclick={back} data-testid="play-back">{t('play.back')}</button>
        <button class="btn small" type="button" disabled={trail.length === 0} onclick={restart} data-testid="play-restart">{t('play.restart')}</button>
        <label class="row"><input type="checkbox" bind:checked={showHints} /> {t('play.hints')}</label>
      </div>
    </div>

    {#if screen}
      <div class="panel stack">
        <div class="row spread">
          <strong data-testid="play-caption">{screen.caption || screen.id}</strong>
          <span class="muted small">{t('play.position', { n: trail.length + 1 })}</span>
        </div>
        {#if screen.description}<p>{screen.description}</p>{/if}
        <div data-testid="play-canvas">
          <HotspotCanvas src={url} width={size?.w ?? 1280} height={size?.h ?? 1024} hotspots={screen.hotspots} mode="play" {showHints} onpress={press} />
        </div>
        {#each screen.admonitions ?? [] as a, i (i)}
          <p class="adm {a.level}"><strong>{t(`level.${a.level}`)}</strong> {a.text}</p>
        {/each}
        {#if message}<p class="msg" role="status" data-testid="play-message">{message}</p>{/if}
        {#if screen.hotspots.length === 0}<p class="muted small">{t('play.end')}</p>{/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .adm {
    padding: 0.4rem 0.6rem;
    border-radius: var(--radius);
    background: var(--surface-2);
    margin: 0;
  }
  .adm.warning {
    background: var(--danger-soft);
  }
  .adm.caution {
    background: var(--warn-soft);
  }
  .msg {
    color: var(--warn);
    margin: 0;
  }
</style>
