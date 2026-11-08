<!--
  E-0 のインスペクター: 選んでいるもの（マニュアル / Topic / 画面 / ホットスポット / 素材）に応じて欄が変わる。
  手順（procedure / troubleshooting）の中身は中央の ProcedureEditor で編集するので、ここでは Topic の欄を出す。
  マニュアル（題名・版・適用範囲）は構成ツリーの「マニュアル」を選ぶと出る。素材は下の「素材」の引き出しで選ぶと出る。
-->
<script lang="ts">
  import type { HotspotAction, TopicKind } from '@shuji-bonji/experiential-manual-model';
  import { editor } from '$lib/state.svelte';
  import { moveScreen, removeHotspot, removeScreen, removeTopic, setStartScreen, setTransition, updateHotspot, updateTopic } from '$lib/ops';
  import { embeddedData } from '$lib/io';
  import { t } from '$lib/i18n';
  import ScopeRefs from './ScopeRefs.svelte';
  import ManualPanel from './ManualPanel.svelte';
  import AssetInspector from './AssetInspector.svelte';
  import StepInspector from './StepInspector.svelte';
  import { flattenSteps } from '$lib/ops';

  const kinds: TopicKind[] = ['screenFlow', 'procedure', 'description', 'troubleshooting'];
  const actions: HotspotAction[] = ['press', 'input', 'read'];

  const sel = $derived(editor.selection);
  const topic = $derived(editor.manual.topics.find((x) => x.id === sel.topicId));
  const screens = $derived(topic?.screens ?? []);
  const screen = $derived(screens.find((s) => s.id === sel.screenId));
  const hotspot = $derived(screen?.hotspots.find((h) => h.id === sel.hotspotId));
  const step = $derived(sel.stepId && topic ? flattenSteps(topic.steps).find((x) => x.step.id === sel.stepId)?.step : undefined);
  const asset = $derived(screen ? editor.manual.assets?.find((a) => a.id === screen.assetRef) : undefined);
  const imageUrl = $derived(screen ? editor.images.get(screen.assetRef) : undefined);

  let labelInput = $state<HTMLInputElement | undefined>();
  let replaceInput = $state<HTMLInputElement | undefined>();

  // 描き終えた直後に「ラベル」へフォーカスを移す
  $effect(() => {
    void editor.focusLabel;
    if (editor.focusLabel > 0) labelInput?.focus();
  });

  // 座標の入力欄は、確定（change）したときだけ反映する
  let coordsText = $state('');
  $effect(() => {
    coordsText = hotspot ? hotspot.coords.join(', ') : '';
  });
  function commitCoords() {
    if (!topic || !screen || !hotspot) return;
    const nums = coordsText.split(/[\s,]+/).filter(Boolean).map(Number);
    editor.apply((m) => updateHotspot(m, topic.id, screen.id, hotspot.id, { coords: nums }));
    coordsText = (editor.manual.topics.find((x) => x.id === topic.id)?.screens?.find((s) => s.id === screen.id)?.hotspots.find((h) => h.id === hotspot.id)?.coords ?? []).join(', ');
  }

  /** 遷移先として選べる画面（同じ Topic を先頭に）と、手順の Topic の手順 */
  const screenTargets = $derived(
    [...editor.manual.topics].filter((x) => x.screens?.length).sort((a, b) => (a.id === topic?.id ? -1 : b.id === topic?.id ? 1 : 0))
  );
  const stepTargets = $derived(editor.manual.topics.filter((x) => x.kind === 'procedure' && x.steps?.length));
  const targetKnown = $derived(
    !hotspot?.transition ||
      editor.manual.topics.some((x) => x.screens?.some((s) => s.id === hotspot.transition!.to) || x.steps?.some((s) => s.id === hotspot.transition!.to))
  );

  const NEW = '__new__';
  function onTransition(value: string) {
    if (!topic || !screen || !hotspot) return;
    const extra = { label: hotspot.transition?.label, condition: hotspot.transition?.condition };
    if (value === NEW) {
      const id = editor.addBlankScreen(topic.id);
      if (id) editor.apply((m) => setTransition(m, topic.id, screen.id, hotspot.id, id, extra));
      return;
    }
    editor.apply((m) => setTransition(m, topic.id, screen.id, hotspot.id, value || null, extra));
  }

  async function onReplace(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file && topic && screen) await editor.replaceScreenImage(topic.id, screen.id, file);
  }

  function removeCurrentScreen() {
    if (!topic || !screen) return;
    if (!confirm(t('screen.confirmRemove', { name: screen.caption || screen.id }))) return;
    editor.apply((m) => removeScreen(m, topic.id, screen.id));
    editor.fixSelection();
  }
  function removeCurrentTopic() {
    if (!topic) return;
    if (!confirm(t('topic.confirmRemove', { title: topic.title }))) return;
    editor.apply((m) => removeTopic(m, topic.id));
    editor.fixSelection();
  }
</script>

<aside class="inspector" aria-label={t('inspector.heading')}>
  {#if sel.root}
    <h2>{t('inspector.manual')}</h2>
    <ManualPanel />
  {:else if sel.assetId}
    <h2>{t('inspector.asset')}</h2>
    <AssetInspector assetId={sel.assetId} />
  {:else if !topic}
    <p class="muted small">{t('inspector.none')}</p>
  {:else if step}
    <h2>{t('inspector.step')}</h2>
    <StepInspector {topic} {step} />
  {:else if hotspot && screen}
    <h2>{t('inspector.hotspot')} <span class="badge">{t(`shape.${hotspot.shape}`)}</span></h2>
    <div class="stack" data-testid="hotspot-form">
      <label class="field">
        <span class="caption">{t('hotspot.label')}</span>
        <input bind:this={labelInput} type="text" value={hotspot.label ?? ''} oninput={(e) => editor.apply((m) => updateHotspot(m, topic.id, screen.id, hotspot.id, { label: e.currentTarget.value }), `hs-label:${hotspot.id}`)} data-testid="hotspot-label" />
      </label>
      <fieldset class="actions">
        <legend>{t('hotspot.action')}</legend>
        {#each actions as a (a)}
          <label><input type="radio" name="action" value={a} checked={(hotspot.action ?? 'press') === a} onchange={() => editor.apply((m) => updateHotspot(m, topic.id, screen.id, hotspot.id, { action: a }))} /> {t(`action.${a}`)}</label>
        {/each}
      </fieldset>
      <label class="field">
        <span class="caption">{t('hotspot.transition')}</span>
        <select value={hotspot.transition?.to ?? ''} data-testid="hotspot-transition" onchange={(e) => onTransition(e.currentTarget.value)}>
          <option value="">{t('hotspot.transitionNone')}</option>
          <option value={NEW}>{t('hotspot.transitionNew')}</option>
          {#if !targetKnown && hotspot.transition}
            <option value={hotspot.transition.to}>{t('hotspot.transitionBroken', { to: hotspot.transition.to })}</option>
          {/if}
          {#each screenTargets as tt (tt.id)}
            <optgroup label={tt.title}>
              {#each tt.screens ?? [] as s (s.id)}
                <option value={s.id}>{s.caption || s.id}</option>
              {/each}
            </optgroup>
          {/each}
          {#each stepTargets as tt (tt.id)}
            <optgroup label="{t('hotspot.transitionStep')}: {tt.title}">
              {#each tt.steps ?? [] as s (s.id)}
                <option value={s.id}>{s.text.slice(0, 30)}</option>
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
        <span class="caption">{t('hotspot.transitionLabel')}</span>
        <input type="text" value={hotspot.transition?.label ?? ''} disabled={!hotspot.transition} oninput={(e) => editor.apply((m) => setTransition(m, topic.id, screen.id, hotspot.id, hotspot.transition!.to, { condition: hotspot.transition?.condition, label: e.currentTarget.value }), `hs-tlabel:${hotspot.id}`)} />
      </label>
      <label class="field">
        <span class="caption">{t('hotspot.coords', { shape: t(`shape.${hotspot.shape}`) })}</span>
        <input type="text" bind:value={coordsText} onchange={commitCoords} class="mono" data-testid="hotspot-coords" />
        <span class="muted small">{t(`hotspot.coordsHelp.${hotspot.shape}`)}</span>
      </label>
      <button class="btn small danger" type="button" onclick={() => { editor.apply((m) => removeHotspot(m, topic.id, screen.id, hotspot.id)); editor.select({ topicId: topic.id, screenId: screen.id }); }}>{t('hotspot.remove')}</button>
    </div>
  {:else if screen}
    <h2>{t('inspector.screen')} <span class="muted small">{t('screen.index', { n: screens.indexOf(screen) + 1 })}</span></h2>
    <div class="stack">
      <div class="row">
        <button class="btn small" type="button" disabled={topic.startScreenRef === screen.id} onclick={() => editor.apply((m) => setStartScreen(m, topic.id, screen.id))}>{t('screen.setStart')}</button>
        <button class="btn small" type="button" disabled={screens[0]?.id === screen.id} onclick={() => editor.apply((m) => moveScreen(m, topic.id, screen.id, -1))} aria-label={t('common.up')}>↑</button>
        <button class="btn small" type="button" disabled={screens[screens.length - 1]?.id === screen.id} onclick={() => editor.apply((m) => moveScreen(m, topic.id, screen.id, 1))} aria-label={t('common.down')}>↓</button>
      </div>
      <div class="image">
        <input bind:this={replaceInput} class="sr-only" type="file" accept="image/*" onchange={onReplace} data-testid="replace-input" />
        {#if !imageUrl}
          <p class="notice warn">{t('screen.imageMissing', { path: asset?.source.path ?? screen.assetRef })}</p>
          <button class="btn small" type="button" onclick={() => replaceInput?.click()}>{t('screen.assignImage')}</button>
        {:else}
          <div class="row">
            <button class="btn small" type="button" onclick={() => replaceInput?.click()}>{t('screen.replaceImage')}</button>
            <button class="btn small" type="button" onclick={() => editor.downloadImage(screen.assetRef)}>{t('screen.saveImage')}</button>
          </div>
          <p class="muted small">{t('screen.imageNote', { path: asset && embeddedData(asset.source) ? t('screen.embedded') : (asset?.source.path ?? '') })}</p>
        {/if}
      </div>
      <ScopeRefs target={{ kind: 'screen', topicId: topic.id, screenId: screen.id }} />
      <button class="btn small danger" type="button" onclick={removeCurrentScreen}>{t('screen.remove')}</button>
    </div>
  {:else}
    <h2>{t('inspector.topic')} <span class="badge">{t(`kind.${topic.kind}`)}</span></h2>
    <div class="stack">
      <label class="field">
        <span class="caption">{t('topic.title')}</span>
        <input type="text" value={topic.title} oninput={(e) => editor.apply((m) => updateTopic(m, topic.id, { title: e.currentTarget.value }), `topic-title:${topic.id}`)} data-testid="topic-title" />
      </label>
      <label class="field">
        <span class="caption">{t('topic.kind')}</span>
        <select value={topic.kind} onchange={(e) => editor.apply((m) => updateTopic(m, topic.id, { kind: e.currentTarget.value as TopicKind }))}>
          {#each kinds as k (k)}
            <option value={k}>{t(`kind.${k}`)}</option>
          {/each}
        </select>
      </label>
      <label class="field">
        <span class="caption">{t('topic.summary')}</span>
        <textarea rows="3" value={topic.summary ?? ''} oninput={(e) => editor.apply((m) => updateTopic(m, topic.id, { summary: e.currentTarget.value }), `topic-summary:${topic.id}`)}></textarea>
      </label>
      <ScopeRefs target={{ kind: 'topic', topicId: topic.id }} />
      <button class="btn small danger" type="button" onclick={removeCurrentTopic}>{t('common.remove')}</button>
    </div>
  {/if}
</aside>

<style>
  .inspector {
    font-size: 0.9rem;
  }
  h2 {
    font-size: 0.95rem;
    margin: 0 0 0.6rem;
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .stack {
    display: grid;
    gap: 0.6rem;
  }
  .actions {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.3rem 0.6rem 0.5rem;
    display: flex;
    gap: 0.8rem;
    flex-wrap: wrap;
  }
  .actions legend {
    font-size: 0.8rem;
    color: var(--muted);
  }
  .mono {
    font-family: var(--mono);
  }
  .notice.warn {
    background: var(--warn-soft);
    color: var(--warn);
    border-radius: var(--radius);
    padding: 0.4rem 0.6rem;
    margin: 0 0 0.4rem;
  }
</style>
