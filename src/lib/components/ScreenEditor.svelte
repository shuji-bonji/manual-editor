<!--
  画面エディター（screenFlow の Topic）。画面の追加・並べ替え・削除、画像の上でのホットスポットの作図、
  ホットスポットのラベル・操作の種類・遷移先の編集をする。
-->
<script lang="ts">
  import type { HotspotAction, Topic } from '@shuji-bonji/experiential-manual-model';
  import { editor } from '$lib/state.svelte';
  import {
    addAdmonition,
    addHotspot,
    moveScreen,
    removeAdmonition,
    removeHotspot,
    removeScreen,
    setStartScreen,
    setTransition,
    updateAdmonition,
    updateHotspot,
    updateScreen
  } from '$lib/ops';
  import { t } from '$lib/i18n';
  import HotspotCanvas from './HotspotCanvas.svelte';
  import ScopeRefs from './ScopeRefs.svelte';

  let { topic }: { topic: Topic } = $props();

  type Tool = 'select' | 'rect' | 'circle';
  let tool = $state<Tool>('rect');
  let fileInput: HTMLInputElement | undefined = $state();
  let assignInput: HTMLInputElement | undefined = $state();

  const screens = $derived(topic.screens ?? []);
  const screen = $derived(screens.find((s) => s.id === editor.selection.screenId));
  const hotspot = $derived(screen?.hotspots.find((h) => h.id === editor.selection.hotspotId));
  const asset = $derived(screen ? editor.manual.assets?.find((a) => a.id === screen.assetRef) : undefined);
  const imageUrl = $derived(screen ? editor.images.get(screen.assetRef) : undefined);
  const size = $derived(screen ? editor.sizes.get(screen.assetRef) : undefined);
  /** 画像が無いときの仮の大きさ */
  const W = $derived(size?.w ?? 1280);
  const H = $derived(size?.h ?? 1024);

  const actions: HotspotAction[] = ['press', 'input', 'read'];

  // 座標の入力欄は、確定（change）したときだけ反映する。途中の入力で検査に引っかかるのを避けるため
  let coordsText = $state('');
  $effect(() => {
    coordsText = hotspot ? hotspot.coords.join(', ') : '';
  });

  function onDraw(shape: 'rect' | 'circle' | 'poly', coords: number[]) {
    if (!screen) return;
    const id = editor.apply((m) =>
      addHotspot(m, topic.id, screen.id, {
        shape,
        coords,
        label: t('hotspot.defaultLabel', { n: screen.hotspots.length + 1 })
      })
    );
    if (id) {
      editor.select({ topicId: topic.id, screenId: screen.id, hotspotId: id });
      tool = 'select';
    }
  }

  function commitCoords() {
    if (!screen || !hotspot) return;
    const nums = coordsText.split(/[\s,]+/).filter(Boolean).map(Number);
    editor.apply((m) => updateHotspot(m, topic.id, screen.id, hotspot.id, { coords: nums }));
    coordsText = (editor.manual.topics.find((x) => x.id === topic.id)?.screens?.find((s) => s.id === screen.id)?.hotspots.find((h) => h.id === hotspot.id)?.coords ?? []).join(', ');
  }

  function removeCurrentScreen() {
    if (!screen) return;
    if (!confirm(t('screen.confirmRemove', { name: screen.caption || screen.id }))) return;
    editor.apply((m) => removeScreen(m, topic.id, screen.id));
    editor.fixSelection();
  }

  async function onFiles(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = '';
    await editor.addScreensFromFiles(topic.id, files);
  }

  async function onAssign(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = '';
    if (!screen || files.length === 0) return;
    await editor.attachImage(screen.assetRef, files[0]);
  }

  /** 遷移先として選べる画面（すべての screenFlow の画面。同じ Topic を先頭に置く） */
  const targets = $derived(
    [...editor.manual.topics]
      .filter((x) => x.screens?.length)
      .sort((a, b) => (a.id === topic.id ? -1 : b.id === topic.id ? 1 : 0))
  );
  const targetKnown = $derived(
    !hotspot?.transition || editor.manual.topics.some((x) => x.screens?.some((s) => s.id === hotspot.transition!.to))
  );
</script>

<div class="editor">
  <aside class="screens panel" aria-labelledby="screens-h">
    <h2 id="screens-h">{t('screen.heading')}</h2>
    <ul class="list">
      {#each screens as s, i (s.id)}
        <li class:selected={s.id === screen?.id}>
          <button class="screen-pick" type="button" onclick={() => editor.select({ topicId: topic.id, screenId: s.id })}>
            <span class="num">{i + 1}</span>
            <span class="name">{s.caption || s.id}</span>
            {#if s.id === topic.startScreenRef}<span class="badge">{t('screen.start')}</span>{/if}
            <span class="muted small">{t('screen.hotspotCount', { n: s.hotspots.length })}</span>
          </button>
        </li>
      {/each}
    </ul>
    <input bind:this={fileInput} class="sr-only" type="file" accept="image/*" multiple onchange={onFiles} data-testid="add-screen-input" />
    <button class="btn primary" type="button" onclick={() => fileInput?.click()}>{t('screen.add')}</button>
    <p class="muted small">{t('screen.addHelp')}</p>
  </aside>

  <section class="main" aria-label={t('screen.editorLabel')}>
    {#if !screen}
      <div class="panel muted">{t('screen.noneSelected')}</div>
    {:else}
      <div class="panel stack">
        <div class="row spread">
          <div class="row" role="toolbar" aria-label={t('tool.label')}>
            <button class="btn small" class:active={tool === 'select'} type="button" aria-pressed={tool === 'select'} onclick={() => (tool = 'select')}>{t('tool.select')}</button>
            <button class="btn small" class:active={tool === 'rect'} type="button" aria-pressed={tool === 'rect'} onclick={() => (tool = 'rect')} data-testid="tool-rect">{t('tool.rect')}</button>
            <button class="btn small" class:active={tool === 'circle'} type="button" aria-pressed={tool === 'circle'} onclick={() => (tool = 'circle')}>{t('tool.circle')}</button>
          </div>
          <span class="muted small">{size ? t('screen.size', { w: size.w, h: size.h }) : t('screen.sizeUnknown')}</span>
        </div>
        <p class="muted small">{tool === 'select' ? t('tool.helpSelect') : t('tool.helpDraw')}</p>

        <div data-testid="screen-canvas">
          <HotspotCanvas
            src={imageUrl}
            width={W}
            height={H}
            hotspots={screen.hotspots}
            selectedId={hotspot?.id}
            {tool}
            onselect={(id) => editor.select({ topicId: topic.id, screenId: screen.id, hotspotId: id })}
            ondraw={onDraw}
          />
        </div>

        {#if !imageUrl}
          <div class="notice warn">
            <p>{t('screen.imageMissing', { path: asset?.source.path ?? screen.assetRef })}</p>
            <input bind:this={assignInput} class="sr-only" type="file" accept="image/*" onchange={onAssign} />
            <button class="btn small" type="button" onclick={() => assignInput?.click()}>{t('screen.assignImage')}</button>
          </div>
        {:else}
          <div class="row">
            <input bind:this={assignInput} class="sr-only" type="file" accept="image/*" onchange={onAssign} />
            <button class="btn small" type="button" onclick={() => assignInput?.click()}>{t('screen.replaceImage')}</button>
            <button class="btn small" type="button" onclick={() => editor.downloadImage(screen.assetRef)}>{t('screen.saveImage')}</button>
            <span class="muted small">{t('screen.imageNote', { path: asset?.source.path.startsWith('data:') ? t('screen.embedded') : (asset?.source.path ?? '') })}</span>
          </div>
        {/if}
      </div>

      <div class="cols">
        <div class="panel">
          <h3>{t('screen.props')}</h3>
          <label class="field">
            <span class="caption">{t('screen.caption')}</span>
            <input type="text" value={screen.caption ?? ''} oninput={(e) => editor.apply((m) => updateScreen(m, topic.id, screen.id, { caption: e.currentTarget.value }), `screen-caption:${screen.id}`)} />
          </label>
          <label class="field">
            <span class="caption">{t('screen.description')}</span>
            <textarea value={screen.description ?? ''} oninput={(e) => editor.apply((m) => updateScreen(m, topic.id, screen.id, { description: e.currentTarget.value }), `screen-desc:${screen.id}`)}></textarea>
          </label>
          <div class="row">
            <button class="btn small" type="button" disabled={topic.startScreenRef === screen.id} onclick={() => editor.apply((m) => setStartScreen(m, topic.id, screen.id))}>{t('screen.setStart')}</button>
            <button class="btn small" type="button" disabled={screens[0]?.id === screen.id} onclick={() => editor.apply((m) => moveScreen(m, topic.id, screen.id, -1))} aria-label={t('common.up')}>↑</button>
            <button class="btn small" type="button" disabled={screens[screens.length - 1]?.id === screen.id} onclick={() => editor.apply((m) => moveScreen(m, topic.id, screen.id, 1))} aria-label={t('common.down')}>↓</button>
            <button class="btn small danger" type="button" onclick={removeCurrentScreen}>{t('screen.remove')}</button>
          </div>
          <h3 class="gap-top">{t('admonition.heading')}</h3>
          {#each screen.admonitions ?? [] as a, i (i)}
            <div class="adm row">
              <select value={a.level} aria-label={t('admonition.level')} onchange={(e) => editor.apply((m) => updateAdmonition(m, { kind: 'screen', topicId: topic.id, screenId: screen.id }, i, { level: e.currentTarget.value as 'warning' | 'caution' | 'note' }))}>
                <option value="warning">{t('level.warning')}</option>
                <option value="caution">{t('level.caution')}</option>
                <option value="note">{t('level.note')}</option>
              </select>
              <input type="text" value={a.text} aria-label={t('admonition.text')} oninput={(e) => editor.apply((m) => updateAdmonition(m, { kind: 'screen', topicId: topic.id, screenId: screen.id }, i, { text: e.currentTarget.value }), `screen-adm:${screen.id}:${i}`)} />
              <button class="btn small danger" type="button" onclick={() => editor.apply((m) => removeAdmonition(m, { kind: 'screen', topicId: topic.id, screenId: screen.id }, i))}>{t('common.remove')}</button>
            </div>
          {/each}
          <button class="btn small" type="button" onclick={() => editor.apply((m) => addAdmonition(m, { kind: 'screen', topicId: topic.id, screenId: screen.id }, 'note', ''))}>{t('admonition.add')}</button>
          <div class="gap-top">
            <ScopeRefs target={{ kind: 'screen', topicId: topic.id, screenId: screen.id }} />
          </div>
        </div>

        <div class="panel">
          <h3>{t('hotspot.heading')}</h3>
          {#if screen.hotspots.length === 0}
            <p class="muted small">{t('hotspot.empty')}</p>
          {/if}
          <ul class="list">
            {#each screen.hotspots as h (h.id)}
              <li class:selected={h.id === hotspot?.id}>
                <button class="screen-pick" type="button" onclick={() => editor.select({ topicId: topic.id, screenId: screen.id, hotspotId: h.id })}>
                  <span class="badge">{t(`shape.${h.shape}`)}</span>
                  <span class="name">{h.label || h.id}</span>
                  {#if h.transition}<span class="muted small">→ {h.transition.to}</span>{/if}
                </button>
              </li>
            {/each}
          </ul>

          {#if hotspot}
            <div class="hs-form" data-testid="hotspot-form">
              <label class="field">
                <span class="caption">{t('hotspot.label')}</span>
                <input type="text" value={hotspot.label ?? ''} oninput={(e) => editor.apply((m) => updateHotspot(m, topic.id, screen.id, hotspot.id, { label: e.currentTarget.value }), `hs-label:${hotspot.id}`)} data-testid="hotspot-label" />
              </label>
              <label class="field">
                <span class="caption">{t('hotspot.action')}</span>
                <select value={hotspot.action ?? ''} onchange={(e) => editor.apply((m) => updateHotspot(m, topic.id, screen.id, hotspot.id, { action: e.currentTarget.value as HotspotAction | '' }))}>
                  <option value="">{t('hotspot.actionNone')}</option>
                  {#each actions as a (a)}
                    <option value={a}>{t(`action.${a}`)}</option>
                  {/each}
                </select>
              </label>
              <label class="field">
                <span class="caption">{t('hotspot.transition')}</span>
                <select
                  value={hotspot.transition?.to ?? ''}
                  data-testid="hotspot-transition"
                  onchange={(e) => editor.apply((m) => setTransition(m, topic.id, screen.id, hotspot.id, e.currentTarget.value || null, { label: hotspot.transition?.label, condition: hotspot.transition?.condition }))}
                >
                  <option value="">{t('hotspot.transitionNone')}</option>
                  {#if !targetKnown && hotspot.transition}
                    <option value={hotspot.transition.to}>{t('hotspot.transitionBroken', { to: hotspot.transition.to })}</option>
                  {/if}
                  {#each targets as tt (tt.id)}
                    <optgroup label={tt.title}>
                      {#each tt.screens ?? [] as s (s.id)}
                        <option value={s.id}>{s.caption || s.id}</option>
                      {/each}
                    </optgroup>
                  {/each}
                </select>
              </label>
              <label class="field">
                <span class="caption">{t('hotspot.condition')}</span>
                <input type="text" value={hotspot.transition?.condition ?? ''} disabled={!hotspot.transition} oninput={(e) => editor.apply((m) => setTransition(m, topic.id, screen.id, hotspot.id, hotspot.transition!.to, { label: hotspot.transition?.label, condition: e.currentTarget.value }), `hs-cond:${hotspot.id}`)} />
              </label>
              <label class="field">
                <span class="caption">{t('hotspot.coords', { shape: t(`shape.${hotspot.shape}`) })}</span>
                <input type="text" bind:value={coordsText} onchange={commitCoords} class="mono" />
                <span class="muted small">{t(`hotspot.coordsHelp.${hotspot.shape}`)}</span>
              </label>
              <button class="btn small danger" type="button" onclick={() => { editor.apply((m) => removeHotspot(m, topic.id, screen.id, hotspot.id)); editor.select({ topicId: topic.id, screenId: screen.id }); }}>{t('hotspot.remove')}</button>
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </section>
</div>

<style>
  .editor {
    display: grid;
    grid-template-columns: minmax(11rem, 14rem) 1fr;
    gap: var(--gap);
    align-items: start;
  }
  @media (max-width: 760px) {
    .editor {
      grid-template-columns: 1fr;
    }
  }
  .main {
    display: grid;
    gap: var(--gap);
    min-width: 0;
  }
  .cols {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
    gap: var(--gap);
  }
  .screen-pick {
    display: flex;
    gap: 0.4rem;
    align-items: center;
    width: 100%;
    padding: 0.4rem 0.5rem;
    border: 0;
    background: none;
    text-align: left;
    cursor: pointer;
    flex-wrap: wrap;
  }
  .num {
    font-family: var(--mono);
    color: var(--muted);
  }
  .name {
    font-weight: 600;
  }
  .notice.warn {
    background: var(--warn-soft);
    color: var(--warn);
    border-radius: var(--radius);
    padding: 0.4rem 0.6rem;
  }
  .gap-top {
    margin-top: 0.8rem;
  }
  .adm {
    margin-bottom: 0.3rem;
    flex-wrap: nowrap;
  }
  .adm select {
    width: 7rem;
    flex: none;
  }
  .mono {
    font-family: var(--mono);
  }
  .hs-form {
    border-top: 1px solid var(--border);
    padding-top: 0.6rem;
    margin-top: 0.6rem;
  }
</style>
