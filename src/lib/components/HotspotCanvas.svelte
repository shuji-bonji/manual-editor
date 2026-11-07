<!--
  画面の画像とホットスポットを SVG で重ねて描く部品。画面エディター（描く・選ぶ）と体験表示（押す）の両方で使う。

  - SVG の viewBox は画像の元の大きさ（画素）。画像は表示の大きさに合わせて縮むが、
    ポインターの位置は getScreenCTM の逆行列で viewBox の座標（= 画像の元の画素）に直すので、coords は常に元の画素で持てる。
  - tool が 'rect' / 'circle' のとき、ドラッグで図形を描き、離したときに ondraw を呼ぶ。小さすぎる図形（4 画素未満）は描かない。
  - mode が 'play' のとき、ホットスポットを押す（クリック、Enter、Space）と onpress を呼ぶ。
-->
<script lang="ts">
  import type { Hotspot, HotspotShape } from '@shuji-bonji/experiential-manual-model';
  import { t } from '$lib/i18n';

  type Tool = 'select' | 'rect' | 'circle';

  interface Props {
    src?: string;
    width: number;
    height: number;
    hotspots: Hotspot[];
    selectedId?: string;
    tool?: Tool;
    mode?: 'edit' | 'play';
    /** play のとき、ホットスポットの場所を常に見せる */
    showHints?: boolean;
    onselect?: (id: string | undefined) => void;
    ondraw?: (shape: HotspotShape, coords: number[]) => void;
    onpress?: (hotspot: Hotspot) => void;
  }

  let {
    src,
    width,
    height,
    hotspots,
    selectedId,
    tool = 'select',
    mode = 'edit',
    showHints = false,
    onselect,
    ondraw,
    onpress
  }: Props = $props();

  let svg: SVGSVGElement | undefined = $state();
  let drag = $state<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

  const MIN_SIZE = 4;
  const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

  /** ポインターの位置を、画像の元の画素の座標に直す */
  function toImage(e: PointerEvent): { x: number; y: number } {
    const ctm = svg!.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const pt = svg!.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(ctm.inverse());
    return { x: clamp(p.x, 0, width), y: clamp(p.y, 0, height) };
  }

  const drawing = $derived(mode === 'edit' && tool !== 'select');

  function down(e: PointerEvent) {
    if (!drawing || e.button !== 0) return;
    const p = toImage(e);
    drag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
    svg!.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function move(e: PointerEvent) {
    if (!drag) return;
    const p = toImage(e);
    drag = { ...drag, x1: p.x, y1: p.y };
  }

  function up(e: PointerEvent) {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (svg!.hasPointerCapture(e.pointerId)) svg!.releasePointerCapture(e.pointerId);
    if (tool === 'rect') {
      if (Math.abs(d.x1 - d.x0) >= MIN_SIZE && Math.abs(d.y1 - d.y0) >= MIN_SIZE)
        ondraw?.('rect', [d.x0, d.y0, d.x1, d.y1].map(Math.round));
    } else if (tool === 'circle') {
      const r = Math.hypot(d.x1 - d.x0, d.y1 - d.y0);
      if (r >= MIN_SIZE) ondraw?.('circle', [d.x0, d.y0, r].map(Math.round));
    }
  }

  function cancel() {
    drag = null;
  }

  function activate(h: Hotspot) {
    if (mode === 'play') onpress?.(h);
    else onselect?.(h.id);
  }

  function keydown(e: KeyboardEvent, h: Hotspot) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      activate(h);
    }
  }

  function points(c: number[]): string {
    const out: string[] = [];
    for (let i = 0; i + 1 < c.length; i += 2) out.push(`${c[i]},${c[i + 1]}`);
    return out.join(' ');
  }

  const previewR = $derived(drag ? Math.hypot(drag.x1 - drag.x0, drag.y1 - drag.y0) : 0);
</script>

<!--
  svg 全体のポインター操作は作図のためのもので、キーボードでの操作は個々のホットスポット（Tab で移動、Enter / Space）と
  画面エディターの一覧が受け持つ。そのため、この警告は意図的に抑える。
-->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<svg
  bind:this={svg}
  class="canvas"
  class:drawing
  viewBox="0 0 {width} {height}"
  role="group"
  aria-label={t('canvas.label')}
  onpointerdown={down}
  onpointermove={move}
  onpointerup={up}
  onpointercancel={cancel}
  onclick={(e) => {
    // ホットスポット以外を押したら選択を外す
    if (mode === 'edit' && tool === 'select' && e.target === e.currentTarget) onselect?.(undefined);
  }}
>
  {#if src}
    <image href={src} x="0" y="0" {width} {height} preserveAspectRatio="none" />
  {:else}
    <rect x="0" y="0" {width} {height} class="placeholder" />
    <text x={width / 2} y={height / 2} text-anchor="middle" class="placeholder-text" font-size={Math.max(16, width / 30)}>
      {t('canvas.noImage')}
    </text>
  {/if}

  {#each hotspots as h (h.id)}
    {@const cls = ['hs', h.id === selectedId ? 'selected' : '', mode === 'play' && !showHints ? 'hidden' : ''].join(' ')}
    {#if h.shape === 'rect' && h.coords.length === 4}
      <rect
        class={cls}
        x={Math.min(h.coords[0], h.coords[2])}
        y={Math.min(h.coords[1], h.coords[3])}
        width={Math.abs(h.coords[2] - h.coords[0])}
        height={Math.abs(h.coords[3] - h.coords[1])}
        role="button"
        tabindex="0"
        aria-label={h.label || h.id}
        data-hotspot-id={h.id}
        onclick={() => activate(h)}
        onkeydown={(e) => keydown(e, h)}
      />
    {:else if h.shape === 'circle' && h.coords.length === 3}
      <circle
        class={cls}
        cx={h.coords[0]}
        cy={h.coords[1]}
        r={h.coords[2]}
        role="button"
        tabindex="0"
        aria-label={h.label || h.id}
        data-hotspot-id={h.id}
        onclick={() => activate(h)}
        onkeydown={(e) => keydown(e, h)}
      />
    {:else if h.shape === 'poly' && h.coords.length >= 6}
      <polygon
        class={cls}
        points={points(h.coords)}
        role="button"
        tabindex="0"
        aria-label={h.label || h.id}
        data-hotspot-id={h.id}
        onclick={() => activate(h)}
        onkeydown={(e) => keydown(e, h)}
      />
    {/if}
  {/each}

  {#if drag && tool === 'rect'}
    <rect
      class="preview"
      x={Math.min(drag.x0, drag.x1)}
      y={Math.min(drag.y0, drag.y1)}
      width={Math.abs(drag.x1 - drag.x0)}
      height={Math.abs(drag.y1 - drag.y0)}
    />
  {:else if drag && tool === 'circle'}
    <circle class="preview" cx={drag.x0} cy={drag.y0} r={previewR} />
  {/if}
</svg>

<style>
  .canvas {
    display: block;
    width: 100%;
    height: auto;
    max-height: 75vh;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    touch-action: none;
    user-select: none;
  }
  .canvas.drawing {
    cursor: crosshair;
  }
  .placeholder {
    fill: var(--surface-2);
  }
  .placeholder-text {
    fill: var(--muted);
  }
  .hs {
    fill: var(--hotspot-fill);
    stroke: var(--hotspot-stroke);
    stroke-width: 2;
    vector-effect: non-scaling-stroke;
    cursor: pointer;
  }
  .hs.selected {
    stroke: var(--hotspot-selected);
    stroke-width: 3;
    fill: color-mix(in srgb, var(--hotspot-selected) 22%, transparent);
  }
  /* 体験表示では、場所を隠しておき、指を置いた・フォーカスしたときだけ見せる */
  .hs.hidden {
    fill: transparent;
    stroke: transparent;
  }
  .hs.hidden:hover,
  .hs.hidden:focus-visible {
    fill: var(--hotspot-fill);
    stroke: var(--hotspot-stroke);
  }
  .drawing .hs {
    pointer-events: none;
  }
  .preview {
    fill: color-mix(in srgb, var(--hotspot-selected) 22%, transparent);
    stroke: var(--hotspot-selected);
    stroke-width: 2;
    stroke-dasharray: 6 4;
    vector-effect: non-scaling-stroke;
    pointer-events: none;
  }
</style>
