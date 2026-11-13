<!--
  E-1 画面遷移の編集: player の Stage を mode="edit" で置き、その overlay（画像と同じ座標系の層）に
  選択枠・ハンドル・作図中の図形を描く。座標の変換は Stage の toImage に任せる。

  - □ 矩形 / ○ 円: ドラッグで描く。⬠ 多角形: 点を順に置き、最初の点を押すか Enter で閉じる。Esc で取り消す。
  - ↖ 選択: ホットスポットを押して選ぶ。中をドラッグで移動、ハンドルで変形（矩形 8 つ、円 4 つ、多角形は頂点）。
    矢印キーで 1 px（Shift で 10 px）、Delete で削除。
  - ✋ 手のひら: ホイールで拡大縮小、ドラッグでスクロール。
  - 描き終えたらインスペクターの「ラベル」にフォーカスを移す（editor.focusLabel）。
  - ドラッグ中の変更は同じ coalesce キーで apply し、Undo 1 回で元に戻るようにする。
-->
<script lang="ts">
  import type { Hotspot, Topic } from '@shuji-bonji/experiential-manual-model';
  import { Stage } from '@shuji-bonji/experiential-manual-player/components';
  import { editor, type Tool } from '$lib/state.svelte';
  import { addAdmonition, addHotspot, moveHotspot, removeAdmonition, removeHotspot, updateAdmonition, updateHotspot, updateScreen } from '$lib/ops';
  import { t } from '$lib/i18n';

  let { topic }: { topic: Topic } = $props();

  type Pt = { x: number; y: number };
  type Instance = { toImage(x: number, y: number): Pt; toScreen(x: number, y: number): Pt; imageSize(): { width: number; height: number } };

  /** 選んでいる画面。Topic だけを選んでいるとき（構成ツリーで Topic の行を押したとき）は開始画面を出す */
  const screen = $derived(
    topic.screens?.find((s) => s.id === editor.selection.screenId) ??
      topic.screens?.find((s) => s.id === topic.startScreenRef) ??
      topic.screens?.[0]
  );
  const hotspot = $derived(screen?.hotspots.find((h) => h.id === editor.selection.hotspotId));
  const tool = $derived(editor.tool);
  const size = $derived(screen ? editor.sizes.get(screen.assetRef) : undefined);

  let stage = $state<Instance | undefined>();
  let viewport = $state<HTMLDivElement | undefined>();
  let zoom = $state(100);

  const tools: Array<{ id: Tool; mark: string; label: string }> = [
    { id: 'select', mark: '↖', label: t('tool.select') },
    { id: 'rect', mark: '□', label: t('tool.rect') },
    { id: 'circle', mark: '○', label: t('tool.circle') },
    { id: 'poly', mark: '⬠', label: t('tool.poly') },
    { id: 'pan', mark: '✋', label: t('tool.pan') }
  ];
  const help: Record<Tool, string> = {
    select: t('tool.helpSelectFull'),
    rect: t('tool.helpDraw'),
    circle: t('tool.helpDraw'),
    poly: t('tool.helpPoly'),
    pan: t('tool.helpPan')
  };

  function resolveAsset(ref: string) {
    const url = editor.images.get(ref);
    const s = editor.sizes.get(ref);
    return { url, width: s?.w, height: s?.h };
  }

  const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
  function pt(e: PointerEvent): Pt {
    if (!stage) return { x: 0, y: 0 };
    const p = stage.toImage(e.clientX, e.clientY);
    const s = stage.imageSize();
    return { x: clamp(p.x, 0, s.width), y: clamp(p.y, 0, s.height) };
  }

  // ---- 作図 -----------------------------------------------------------------
  const MIN = 4;
  let drawing = $state<{ start: Pt; now: Pt } | undefined>();
  let poly = $state<Pt[]>([]);
  let polyHover = $state<Pt | undefined>();
  let session = 0;

  function commitNew(shape: 'rect' | 'circle' | 'poly', coords: number[]) {
    if (!screen) return;
    const id = editor.apply((m) =>
      addHotspot(m, topic.id, screen.id, { shape, coords: coords.map(Math.round), label: t('hotspot.defaultLabel', { n: screen.hotspots.length + 1 }) })
    );
    if (id) {
      editor.select({ topicId: topic.id, screenId: screen.id, hotspotId: id });
      editor.tool = 'select';
      editor.focusLabel++;
    }
  }

  function drawDown(e: PointerEvent) {
    if (e.button !== 0) return;
    const p = pt(e);
    if (tool === 'poly') {
      if (poly.length >= 3 && nearFirst(e)) {
        closePoly();
        return;
      }
      poly = [...poly, p];
      return;
    }
    drawing = { start: p, now: p };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }
  function drawMove(e: PointerEvent) {
    if (tool === 'poly') {
      polyHover = pt(e);
      return;
    }
    if (drawing) drawing = { ...drawing, now: pt(e) };
  }
  function drawUp() {
    if (!drawing) return;
    const { start, now } = drawing;
    drawing = undefined;
    if (tool === 'rect') {
      if (Math.abs(now.x - start.x) >= MIN && Math.abs(now.y - start.y) >= MIN) commitNew('rect', [start.x, start.y, now.x, now.y]);
    } else if (tool === 'circle') {
      const r = Math.hypot(now.x - start.x, now.y - start.y);
      if (r >= MIN) commitNew('circle', [start.x, start.y, r]);
    }
  }
  function nearFirst(e: PointerEvent): boolean {
    const first = poly[0];
    if (!first || !stage) return false;
    const s = stage.toScreen(first.x, first.y);
    return Math.hypot(e.clientX - s.x, e.clientY - s.y) < 10;
  }
  function closePoly() {
    if (poly.length >= 3) commitNew('poly', poly.flatMap((p) => [p.x, p.y]));
    poly = [];
    polyHover = undefined;
  }
  function cancelDrawing() {
    drawing = undefined;
    poly = [];
    polyHover = undefined;
  }

  // ---- 移動・変形 ------------------------------------------------------------
  type Drag = { kind: 'move' | 'handle' | 'vertex'; index: number; start: Pt; coords0: number[]; shape: Hotspot['shape']; key: string };
  let drag = $state<Drag | undefined>();

  function grab(e: PointerEvent, kind: Drag['kind'], index = 0) {
    if (e.button !== 0 || !hotspot) return;
    e.stopPropagation();
    drag = { kind, index, start: pt(e), coords0: [...hotspot.coords], shape: hotspot.shape, key: `hs-drag:${hotspot.id}:${++session}` };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }
  function dragMove(e: PointerEvent) {
    if (!drag || !screen || !hotspot) return;
    const p = pt(e);
    const dx = p.x - drag.start.x;
    const dy = p.y - drag.start.y;
    const c = drag.coords0;
    let next: number[] | undefined;
    if (drag.kind === 'move') {
      next = drag.shape === 'circle' ? [c[0] + dx, c[1] + dy, c[2]] : c.map((v, i) => v + (i % 2 === 0 ? dx : dy));
    } else if (drag.kind === 'vertex') {
      next = [...c];
      next[drag.index * 2] = p.x;
      next[drag.index * 2 + 1] = p.y;
    } else if (drag.shape === 'rect') {
      // index: 0 nw, 1 n, 2 ne, 3 e, 4 se, 5 s, 6 sw, 7 w
      let [x1, y1, x2, y2] = c;
      const i = drag.index;
      if (i === 0 || i === 6 || i === 7) x1 = p.x;
      if (i === 2 || i === 3 || i === 4) x2 = p.x;
      if (i === 0 || i === 1 || i === 2) y1 = p.y;
      if (i === 4 || i === 5 || i === 6) y2 = p.y;
      if (e.shiftKey && i % 2 === 0) {
        // 角のハンドルで Shift: 元の縦横比を保つ
        const ratio = (c[3] - c[1]) / (c[2] - c[0] || 1);
        const w = x2 - x1;
        const h = w * ratio;
        if (i === 0 || i === 2) y1 = y2 - h;
        else y2 = y1 + h;
      }
      next = [x1, y1, x2, y2];
    } else if (drag.shape === 'circle') {
      next = [c[0], c[1], Math.hypot(p.x - c[0], p.y - c[1])];
    }
    if (!next) return;
    const rounded = next.map(Math.round);
    const ok = drag.shape === 'rect' ? rounded[0] !== rounded[2] && rounded[1] !== rounded[3] : drag.shape === 'circle' ? rounded[2] >= 1 : true;
    if (!ok) return;
    editor.apply((m) => updateHotspot(m, topic.id, screen.id, hotspot.id, { coords: rounded }), drag.key);
  }
  function dragUp() {
    drag = undefined;
  }

  // ---- 手のひら・拡大縮小 ----------------------------------------------------------
  let pan = $state<{ x: number; y: number; left: number; top: number } | undefined>();
  function onWheel(e: WheelEvent) {
    if (tool !== 'pan' && !e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    zoom = clamp(Math.round(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)), 25, 400);
  }
  function panDown(e: PointerEvent) {
    if (tool !== 'pan' || !viewport || e.button !== 0) return;
    pan = { x: e.clientX, y: e.clientY, left: viewport.scrollLeft, top: viewport.scrollTop };
    viewport.setPointerCapture(e.pointerId);
  }
  function panMove(e: PointerEvent) {
    if (!pan || !viewport) return;
    viewport.scrollLeft = pan.left - (e.clientX - pan.x);
    viewport.scrollTop = pan.top - (e.clientY - pan.y);
  }
  function panUp() {
    pan = undefined;
  }

  // ---- キーボード -----------------------------------------------------------------
  function onKey(e: KeyboardEvent) {
    if (editor.mode !== 'edit' || !screen) return;
    const target = e.target as HTMLElement | null;
    if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
    if (e.key === 'Escape') {
      if (drawing || poly.length > 0) cancelDrawing();
      else editor.select({ topicId: topic.id, screenId: screen.id });
      return;
    }
    if (e.key === 'Enter' && tool === 'poly' && poly.length >= 3) {
      e.preventDefault();
      closePoly();
      return;
    }
    if (!hotspot) return;
    const step = e.shiftKey ? 10 : 1;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const mv = moves[e.key];
    if (mv) {
      e.preventDefault();
      editor.apply((m) => moveHotspot(m, topic.id, screen.id, hotspot.id, mv[0], mv[1]), `hs-nudge:${hotspot.id}`);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      editor.apply((m) => removeHotspot(m, topic.id, screen.id, hotspot.id));
      editor.select({ topicId: topic.id, screenId: screen.id });
    }
  }

  // ---- 描画の補助 -----------------------------------------------------------------
  const rectOf = (c: number[]) => ({ x: Math.min(c[0], c[2]), y: Math.min(c[1], c[3]), w: Math.abs(c[2] - c[0]), h: Math.abs(c[3] - c[1]) });
  function rectHandles(c: number[]): Pt[] {
    const r = rectOf(c);
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    return [
      { x: r.x, y: r.y },
      { x: cx, y: r.y },
      { x: r.x + r.w, y: r.y },
      { x: r.x + r.w, y: cy },
      { x: r.x + r.w, y: r.y + r.h },
      { x: cx, y: r.y + r.h },
      { x: r.x, y: r.y + r.h },
      { x: r.x, y: cy }
    ];
  }
  const cursors = ['nwse-resize', 'ns-resize', 'nesw-resize', 'ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize', 'ew-resize'];
  const pts = (c: number[]) => c.join(' ');

  const owner = $derived(screen ? ({ kind: 'screen', topicId: topic.id, screenId: screen.id } as const) : undefined);

  // ---- 画像のドロップ（E-6）: ステージに画像ファイルを落とすと、この Topic の画面として足す ----------------------
  let dropping = $state(false);
  function onDragOver(e: DragEvent) {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    dropping = true;
  }
  async function onDrop(e: DragEvent) {
    dropping = false;
    const files = [...(e.dataTransfer?.files ?? [])].filter((f) => f.type.startsWith('image/'));
    if (files.length === 0) return;
    e.preventDefault();
    await editor.addScreensFromFiles(topic.id, files);
  }
</script>

<svelte:window onkeydown={onKey} />

{#if !screen}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="panel muted drop" class:dropping ondragover={onDragOver} ondragleave={() => (dropping = false)} ondrop={onDrop} data-testid="edit-stage-empty">
    {t('stage.noScreen')}
    <span class="small">{t('assets.dropScreens')}</span>
  </div>
{:else}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="edit-stage drop" class:dropping data-testid="edit-stage" ondragover={onDragOver} ondragleave={() => (dropping = false)} ondrop={onDrop}>
    <div class="row spread toolbar">
      <div class="row tools" role="toolbar" aria-label={t('tool.label')}>
        {#each tools as x (x.id)}
          <button type="button" class="tool" class:on={tool === x.id} aria-pressed={tool === x.id} title={x.label} onclick={() => { editor.tool = x.id; cancelDrawing(); }} data-testid="tool-{x.id}">
            <span aria-hidden="true">{x.mark}</span><span class="sr-only">{x.label}</span>
          </button>
        {/each}
      </div>
      <strong class="caption">{screen.caption || screen.id}</strong>
      <div class="row">
        <span class="muted small">{size ? t('screen.size', { w: size.w, h: size.h }) : t('screen.sizeUnknown')}</span>
        <button type="button" class="btn small" onclick={() => (zoom = 100)}>{t('stage.zoom', { pct: zoom })}</button>
      </div>
    </div>
    <p class="muted small help">{help[tool]}</p>

    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      bind:this={viewport}
      class="viewport"
      class:pan={tool === 'pan'}
      class:draw={tool === 'rect' || tool === 'circle' || tool === 'poly'}
      onwheel={onWheel}
      onpointerdown={panDown}
      onpointermove={panMove}
      onpointerup={panUp}
      onpointercancel={panUp}
      data-testid="screen-canvas"
    >
      <div class="inner" style="width: {zoom}%">
        <Stage
          bind:this={stage}
          manual={editor.manual}
          {screen}
          mode="edit"
          hints
          selected={hotspot?.id}
          {resolveAsset}
          onselect={(h) => tool === 'select' && editor.select({ topicId: topic.id, screenId: screen.id, hotspotId: h?.id })}
        >
          {#snippet overlay(img)}
            {@const hs = Math.max(4, img.width / 140)}
            <!-- 作図中: 画像全体を覆う透明の層でポインターを受ける -->
            {#if tool === 'rect' || tool === 'circle' || tool === 'poly'}
              <rect class="capture" x="0" y="0" width={img.width} height={img.height} onpointerdown={drawDown} onpointermove={drawMove} onpointerup={drawUp} onpointercancel={cancelDrawing} />
            {/if}
            {#if drawing && tool === 'rect'}
              {@const r = rectOf([drawing.start.x, drawing.start.y, drawing.now.x, drawing.now.y])}
              <rect class="preview" x={r.x} y={r.y} width={r.w} height={r.h} />
            {:else if drawing && tool === 'circle'}
              <circle class="preview" cx={drawing.start.x} cy={drawing.start.y} r={Math.hypot(drawing.now.x - drawing.start.x, drawing.now.y - drawing.start.y)} />
            {/if}
            {#if poly.length > 0}
              <polyline class="preview" points={[...poly, ...(polyHover ? [polyHover] : [])].map((p) => `${p.x},${p.y}`).join(' ')} />
              {#each poly as p, i (i)}
                <circle class="vertex" class:first={i === 0} cx={p.x} cy={p.y} r={hs * 0.8} />
              {/each}
            {/if}
            <!-- 選択中のホットスポット: 移動用の透明な写しと、変形のハンドル -->
            {#if hotspot && tool === 'select'}
              {@const c = hotspot.coords}
              {#if hotspot.shape === 'rect'}
                {@const r = rectOf(c)}
                <rect class="grab" x={r.x} y={r.y} width={r.w} height={r.h} onpointerdown={(e) => grab(e, 'move')} onpointermove={dragMove} onpointerup={dragUp} onpointercancel={dragUp} />
                {#each rectHandles(c) as p, i (i)}
                  <rect class="handle" x={p.x - hs / 2} y={p.y - hs / 2} width={hs} height={hs} style="cursor: {cursors[i]}" onpointerdown={(e) => grab(e, 'handle', i)} onpointermove={dragMove} onpointerup={dragUp} onpointercancel={dragUp} />
                {/each}
              {:else if hotspot.shape === 'circle'}
                <circle class="grab" cx={c[0]} cy={c[1]} r={c[2]} onpointerdown={(e) => grab(e, 'move')} onpointermove={dragMove} onpointerup={dragUp} onpointercancel={dragUp} />
                {#each [[c[0] + c[2], c[1]], [c[0] - c[2], c[1]], [c[0], c[1] + c[2]], [c[0], c[1] - c[2]]] as [x, y], i (i)}
                  <rect class="handle" x={x - hs / 2} y={y - hs / 2} width={hs} height={hs} onpointerdown={(e) => grab(e, 'handle', i)} onpointermove={dragMove} onpointerup={dragUp} onpointercancel={dragUp} />
                {/each}
              {:else}
                <polygon class="grab" points={pts(c)} onpointerdown={(e) => grab(e, 'move')} onpointermove={dragMove} onpointerup={dragUp} onpointercancel={dragUp} />
                {#each Array.from({ length: c.length / 2 }, (_, i) => i) as i (i)}
                  <rect class="handle" x={c[i * 2] - hs / 2} y={c[i * 2 + 1] - hs / 2} width={hs} height={hs} onpointerdown={(e) => grab(e, 'vertex', i)} onpointermove={dragMove} onpointerup={dragUp} onpointercancel={dragUp} />
                {/each}
              {/if}
            {/if}
          {/snippet}
        </Stage>
      </div>
    </div>

    <!-- 画面の説明・注意（文を書く頻度が高いので、インスペクターに隠さず常に出す） -->
    <div class="fields">
      <label class="field">
        <span class="caption">{t('screen.caption')}</span>
        <input type="text" value={screen.caption ?? ''} oninput={(e) => editor.apply((m) => updateScreen(m, topic.id, screen.id, { caption: e.currentTarget.value }), `screen-caption:${screen.id}`)} data-testid="screen-caption" />
      </label>
      <label class="field">
        <span class="caption">{t('screen.description')}</span>
        <textarea rows="2" value={screen.description ?? ''} oninput={(e) => editor.apply((m) => updateScreen(m, topic.id, screen.id, { description: e.currentTarget.value }), `screen-desc:${screen.id}`)}></textarea>
      </label>
      {#if owner}
        <div class="adms">
          {#each screen.admonitions ?? [] as a, i (i)}
            <div class="row adm">
              <select value={a.level} aria-label={t('admonition.level')} onchange={(e) => editor.apply((m) => updateAdmonition(m, owner, i, { level: e.currentTarget.value as 'warning' | 'caution' | 'note' }))}>
                <option value="warning">{t('level.warning')}</option>
                <option value="caution">{t('level.caution')}</option>
                <option value="note">{t('level.note')}</option>
              </select>
              <input type="text" value={a.text} aria-label={t('admonition.text')} oninput={(e) => editor.apply((m) => updateAdmonition(m, owner, i, { text: e.currentTarget.value }), `screen-adm:${screen.id}:${i}`)} />
              <button class="btn small danger" type="button" onclick={() => editor.apply((m) => removeAdmonition(m, owner, i))}>{t('common.remove')}</button>
            </div>
          {/each}
          <button class="btn small" type="button" onclick={() => editor.apply((m) => addAdmonition(m, owner, 'note', ''))}>{t('admonition.add')}</button>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .drop.dropping {
    outline: 2px dashed var(--accent);
    outline-offset: -2px;
    border-radius: var(--radius);
  }
  .panel.drop {
    display: grid;
    gap: 0.4rem;
  }
  .edit-stage {
    display: grid;
    gap: 0.5rem;
    min-width: 0;
  }
  .toolbar {
    flex-wrap: wrap;
  }
  .tools {
    gap: 0.15rem;
  }
  .tool {
    width: 2.1rem;
    height: 2.1rem;
    font-size: 1.1rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    color: inherit;
    cursor: pointer;
  }
  .tool.on {
    background: var(--accent);
    color: var(--accent-text);
    border-color: var(--accent);
  }
  .help {
    margin: -0.3rem 0 0;
  }
  .viewport {
    overflow: auto;
    max-height: 70vh;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface-2);
    touch-action: none;
  }
  .viewport.pan {
    cursor: grab;
  }
  .viewport.draw {
    cursor: crosshair;
  }
  .inner {
    min-width: 100%;
  }
  /* overlay の中の図形。Stage の SVG に入るので :global で指定する */
  :global(.em-stage .capture) {
    fill: transparent;
    stroke: none;
  }
  :global(.em-stage .preview) {
    fill: color-mix(in srgb, var(--hotspot-selected) 22%, transparent);
    stroke: var(--hotspot-selected);
    stroke-width: 2;
    stroke-dasharray: 6 4;
    vector-effect: non-scaling-stroke;
    pointer-events: none;
  }
  :global(.em-stage .vertex) {
    fill: var(--surface);
    stroke: var(--hotspot-selected);
    stroke-width: 2;
    vector-effect: non-scaling-stroke;
    pointer-events: none;
  }
  :global(.em-stage .vertex.first) {
    fill: var(--hotspot-selected);
  }
  :global(.em-stage .grab) {
    fill: transparent;
    stroke: none;
    cursor: move;
  }
  :global(.em-stage .handle) {
    fill: var(--surface);
    stroke: var(--hotspot-selected);
    stroke-width: 2;
    vector-effect: non-scaling-stroke;
    cursor: pointer;
  }
  .fields {
    display: grid;
    gap: 0.4rem;
  }
  .adms {
    display: grid;
    gap: 0.3rem;
  }
  .adm {
    flex-wrap: nowrap;
  }
  .adm select {
    width: 7rem;
    flex: none;
  }
</style>
