<!--
  E-5 遷移の地図（下の引き出し）: 選んでいる Topic の画面をノード、Hotspot.transition を辺にした SVG。
  配置は lib/flowmap.ts（自前の階層配置）。到達できない画面・遷移先の無いホットスポット・遷移先が見つからない辺を赤く出す。
  ノードを押すとその画面を選ぶ（他の Topic への遷移先は、その Topic の画面・手順を選ぶ）。位置は保存しない。
-->
<script lang="ts">
  import { editor } from '$lib/state.svelte';
  import { buildFlowMap, ellipsize } from '$lib/flowmap';
  import { t } from '$lib/i18n';

  const topic = $derived(editor.topic);
  const flowTopics = $derived(editor.manual.topics.filter((x) => x.kind === 'screenFlow'));
  /** 地図に出す Topic。選んでいる Topic が画面の流れでなければ、最初の画面の流れを出す */
  const mapTopic = $derived(topic?.kind === 'screenFlow' ? topic : flowTopics[0]);
  const map = $derived(mapTopic ? buildFlowMap(editor.manual, mapTopic) : undefined);
  const selectedId = $derived(mapTopic && editor.selection.topicId === mapTopic.id ? editor.selection.screenId : undefined);

  let zoom = $state(100);
  let hover = $state<string | undefined>();
  let viewport = $state<HTMLDivElement | undefined>();

  const zoomSteps = [50, 67, 80, 100, 125, 150, 200];
  function zoomBy(dir: 1 | -1) {
    const i = zoomSteps.findIndex((z) => z >= zoom);
    const next = zoomSteps[Math.min(zoomSteps.length - 1, Math.max(0, (i < 0 ? zoomSteps.length - 1 : i) + dir))];
    zoom = next;
  }
  /** 引き出しの幅に収まる倍率にする */
  function fit() {
    if (!map || !viewport) return;
    const avail = viewport.clientWidth - 16;
    zoom = Math.max(25, Math.min(100, Math.floor((avail / map.width) * 100)));
  }

  function pick(target: { topicId: string; screenId?: string; stepId?: string } | undefined) {
    if (!target) return;
    editor.select(target);
    editor.mode = 'edit';
  }

  const highlighted = $derived.by(() => {
    const id = hover ?? selectedId;
    if (!id || !map) return new Set<string>();
    return new Set(map.edges.filter((e) => e.from === id || e.to === id).map((e) => e.id));
  });

  // 選んだ画面が見えるように、引き出しの中をスクロールする
  $effect(() => {
    const id = selectedId;
    if (!id || !map || !viewport) return;
    const n = map.nodes.find((x) => x.id === id);
    if (!n) return;
    const k = zoom / 100;
    const cx = (n.x + n.w / 2) * k;
    const cy = (n.y + n.h / 2) * k;
    const v = viewport;
    if (cx < v.scrollLeft || cx > v.scrollLeft + v.clientWidth || cy < v.scrollTop || cy > v.scrollTop + v.clientHeight) {
      v.scrollTo({ left: Math.max(0, cx - v.clientWidth / 2), top: Math.max(0, cy - v.clientHeight / 2) });
    }
  });
</script>

{#if !mapTopic || !map}
  <p class="muted small">{t('map.noFlow')}</p>
{:else}
  <div class="flowmap" data-testid="flow-map">
    <div class="row spread head">
      <div class="row">
        <strong>{t('map.title', { title: mapTopic.title })}</strong>
        <span class="muted small">{t('map.counts', { screens: map.nodes.filter((n) => n.kind === 'screen').length, edges: map.edges.reduce((s, e) => s + e.count, 0) })}</span>
        {#if flowTopics.length > 1}
          <select aria-label={t('map.topic')} value={mapTopic.id} onchange={(e) => editor.selectTopic(e.currentTarget.value)}>
            {#each flowTopics as x (x.id)}
              <option value={x.id}>{x.title}</option>
            {/each}
          </select>
        {/if}
      </div>
      <div class="row">
        {#if map.unreachable > 0}<span class="badge err" data-testid="map-unreachable">{t('map.unreachable', { n: map.unreachable })}</span>{/if}
        {#if map.dangling > 0}<span class="badge warn" data-testid="map-dangling">{t('map.dangling', { n: map.dangling })}</span>{/if}
        {#if map.broken > 0}<span class="badge err" data-testid="map-broken">{t('map.broken', { n: map.broken })}</span>{/if}
        <button type="button" class="btn small" onclick={fit}>{t('map.fit')}</button>
        <button type="button" class="btn small" onclick={() => zoomBy(-1)} aria-label={t('map.zoomOut')}>−</button>
        <button type="button" class="btn small" onclick={() => (zoom = 100)}>{zoom}%</button>
        <button type="button" class="btn small" onclick={() => zoomBy(1)} aria-label={t('map.zoomIn')}>＋</button>
      </div>
    </div>
    <p class="muted small help">{t('map.help')}</p>

    <div class="viewport" bind:this={viewport}>
      {#if map.nodes.length === 0}
        <p class="muted small">{t('map.empty')}</p>
      {:else}
        <svg
          width={(map.width * zoom) / 100}
          height={(map.height * zoom) / 100}
          viewBox="0 0 {map.width} {map.height}"
          role="img"
          aria-label={t('map.title', { title: mapTopic.title })}
          font-family="var(--font)"
        >
          <defs>
            <!-- 矢印の先。色は辺の状態（通常・強調・参照切れ）ごとに別の marker にする（context-stroke は古いブラウザーで使えない） -->
            {#each ['', '-hi', '-danger'] as suffix (suffix)}
              <marker id="fm-arrow{suffix}" class="arrow{suffix}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" />
              </marker>
            {/each}
          </defs>
          <g class="edges">
            {#each map.edges as e (e.id)}
              {#if e.kind === 'jump'}
                <!-- 名札: 遷移元の下に「ラベル → 行き先」。押すと行き先の画面を選ぶ -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <g class="edge jump" class:hi={highlighted.has(e.id)} data-testid="map-edge" role="button" tabindex="-1" onclick={() => pick(map.nodes.find((n) => n.id === e.to)?.target)} onkeydown={(k) => k.key === 'Enter' && pick(map.nodes.find((n) => n.id === e.to)?.target)} onpointerenter={() => (hover = e.to)} onpointerleave={() => (hover = undefined)}>
                  <path class="line" d={e.d} />
                  <text x={e.lx} y={e.ly} text-anchor="start" class="jump-label">
                    {ellipsize(e.labels[0], 6)}{e.labels.length > 1 ? ` +${e.labels.length - 1}` : ''} → {ellipsize(e.jumpTo ?? '', 8)}
                    <title>{e.labels.join(' / ')} → {e.jumpTo}</title>
                  </text>
                </g>
              {:else}
                <g class="edge {e.kind}" class:broken={e.broken} class:external={e.external} class:hi={highlighted.has(e.id)} data-testid="map-edge">
                  <path class="line" d={e.d} />
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <path class="hit" d={e.d} onpointerenter={() => (hover = e.from)} onpointerleave={() => (hover = undefined)} />
                  <text x={e.lx} y={e.ly} text-anchor="middle">
                    {ellipsize(e.labels[0], 10)}{e.labels.length > 1 ? ` +${e.labels.length - 1}` : ''}
                    <title>{e.labels.join(' / ')}{e.count > e.labels.length ? ` (${e.count})` : ''}</title>
                  </text>
                </g>
              {/if}
            {/each}
          </g>
          <g class="nodes">
            {#each map.nodes as n (n.id)}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <g
                class="node {n.kind}"
                class:start={n.start}
                class:unreachable={n.unreachable}
                class:selected={n.id === selectedId}
                class:dim={hover !== undefined && hover !== n.id && !map.edges.some((e) => highlighted.has(e.id) && (e.from === n.id || e.to === n.id))}
                role="button"
                tabindex="0"
                transform="translate({n.x} {n.y})"
                onclick={() => pick(n.target)}
                onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), pick(n.target))}
                onpointerenter={() => (hover = n.id)}
                onpointerleave={() => (hover = undefined)}
                data-testid="map-node"
                data-node-id={n.id}
              >
                <title>
                  {n.label}{n.sub ? ` — ${n.sub}` : ''}
                  {#if n.kind === 'screen'}{'\n'}{t('screen.hotspotCount', { n: n.hotspots })}{/if}
                  {#if n.unreachable}{'\n'}{t('map.unreachableNode')}{/if}
                  {#if n.dangling > 0}{'\n'}{t('map.danglingNode', { n: n.dangling })}{/if}
                  {#if n.broken > 0}{'\n'}{t('map.brokenNode', { n: n.broken })}{/if}
                </title>
                <rect width={n.w} height={n.h} rx="7" />
                {#if n.start}<circle class="start-dot" cx="12" cy={n.h / 2} r="4" />{/if}
                <text class="label" x={n.start ? 22 : 12} y={n.kind === 'screen' ? n.h / 2 + 4 : n.h / 2 - 3}>{ellipsize(n.label, n.start ? 11 : n.kind === 'missing' ? 20 : 12)}</text>
                {#if n.kind === 'external'}
                  <text class="sub" x="12" y={n.h / 2 + 12}>→ {ellipsize(n.sub ?? '', 14)}</text>
                {:else if n.kind === 'missing'}
                  <text class="sub" x="12" y={n.h / 2 + 12}>{t('map.missing')}</text>
                {:else}
                  <text class="count" x={n.w - 10} y={n.h / 2 + 4} text-anchor="end">{n.hotspots}</text>
                {/if}
                {#if n.dangling > 0 || n.broken > 0}
                  <g class="flag" transform="translate({n.w - 8} 0)">
                    <circle r="8" class:err={n.broken > 0} />
                    <text y="3.5" text-anchor="middle">{n.dangling + n.broken}</text>
                  </g>
                {/if}
              </g>
            {/each}
          </g>
        </svg>
      {/if}
    </div>
  </div>
{/if}

<style>
  .flowmap {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    height: 100%;
    min-height: 0;
  }
  .head select {
    width: auto;
    font-size: 0.85rem;
  }
  .help {
    margin: 0;
  }
  .viewport {
    flex: 1;
    min-height: 0;
    overflow: auto;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg);
  }
  svg {
    display: block;
  }
  /* 辺 */
  .arrow path {
    fill: var(--muted);
  }
  .arrow-hi path {
    fill: var(--accent);
  }
  .arrow-danger path {
    fill: var(--danger);
  }
  .edge path {
    fill: none;
    stroke: var(--muted);
    stroke-width: 1.5;
    opacity: 0.85;
  }
  .edge .line {
    marker-end: url(#fm-arrow);
  }
  .edge.broken .line {
    marker-end: url(#fm-arrow-danger);
  }
  .edge.hi .line {
    marker-end: url(#fm-arrow-hi);
  }
  .edge.hi.broken .line {
    marker-end: url(#fm-arrow-danger);
  }
  .edge.back path {
    stroke-dasharray: 5 4;
  }
  .edge.external path {
    stroke-dasharray: 2 3;
  }
  .edge.broken path {
    stroke: var(--danger);
  }
  .edge.hi path:not(.hit) {
    stroke: var(--accent);
    stroke-width: 2.5;
    opacity: 1;
  }
  .edge.hi.broken path:not(.hit) {
    stroke: var(--danger);
  }
  .edge text {
    font-size: 11px;
    fill: var(--muted);
    paint-order: stroke;
    stroke: var(--bg);
    stroke-width: 3px;
    stroke-linejoin: round;
    pointer-events: none;
  }
  .edge.hi text {
    fill: var(--accent);
  }
  .edge.jump {
    cursor: pointer;
  }
  .edge.jump .line {
    marker-end: none;
    stroke-dasharray: 2 2;
  }
  .edge.jump text {
    pointer-events: all;
    text-anchor: start;
  }
  .edge.jump:hover text {
    fill: var(--accent);
    text-decoration: underline;
  }
  .edge.broken text {
    fill: var(--danger);
  }
  /* ポインターを受ける太い透明の線。色の規則より後に書いて、broken / hi の色が付かないようにする */
  .edge path.hit,
  .edge.broken path.hit,
  .edge.hi path.hit {
    stroke: transparent;
    stroke-width: 12;
    opacity: 1;
    pointer-events: stroke;
    marker-end: none;
  }
  /* ノード */
  .node {
    cursor: pointer;
    outline: none;
  }
  .node rect {
    fill: var(--surface);
    stroke: var(--border);
    stroke-width: 1.5;
  }
  .node.start rect {
    stroke: var(--ok);
  }
  .node.selected rect {
    stroke: var(--accent);
    stroke-width: 3;
  }
  .node:focus-visible rect,
  .node:hover rect {
    stroke: var(--accent);
  }
  .node.unreachable rect {
    stroke: var(--danger);
    stroke-dasharray: 6 3;
    fill: var(--danger-soft);
  }
  .node.external rect {
    stroke-dasharray: 2 3;
    fill: var(--surface-2);
  }
  .node.missing rect {
    stroke: var(--danger);
    fill: var(--danger-soft);
  }
  .node.dim {
    opacity: 0.35;
  }
  .node .label {
    font-size: 13px;
    fill: var(--text);
  }
  .node.missing .label {
    fill: var(--danger);
    font-family: var(--mono);
    font-size: 11px;
  }
  .node .sub {
    font-size: 10px;
    fill: var(--muted);
  }
  .node.missing .sub {
    fill: var(--danger);
  }
  .node .count {
    font-size: 11px;
    fill: var(--muted);
  }
  .start-dot {
    fill: var(--ok);
  }
  .flag circle {
    fill: var(--warn);
  }
  .flag circle.err {
    fill: var(--danger);
  }
  .flag text {
    font-size: 10px;
    font-weight: 700;
    fill: #fff;
  }
</style>
