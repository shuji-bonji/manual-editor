<!--
  ステージ: 画面の画像と、その上のホットスポット。
  - 画像は枠の幅いっぱいに縮尺を合わせて出し、ホットスポットは SVG の viewBox を画像の画素に合わせて重ねる。
    coords は画像の座標のままで描けるので、縮尺の変換はブラウザーに任せる。
  - 既定ではホットスポットは見えない。ホバーかフォーカスで枠が出る。hints で全部の枠を薄く出す。
  - Tab で順に移り、Enter か Space で押せる。
  - editor が使うもの: overlay（同じ座標系で描く層）、toImage / toScreen（座標変換）、mode="edit"（押しても遷移せず onselect）。
-->
<script lang="ts">
  import type { Hotspot, Manual, Screen } from '@shuji-bonji/experiential-manual-model';
  import type { Snippet } from 'svelte';
  import { assetSize, assetUrl } from '../runtime/assets.js';

  interface Props {
    manual: Manual;
    screen: Screen;
    /** Manual の JSON の URL。画像の相対パスの基準 */
    baseUrl?: string | URL;
    hints?: boolean;
    /** play: 押すと onpress。edit: 押しても遷移せず onselect（editor が使う） */
    mode?: 'play' | 'edit';
    /** 強調するホットスポットの id（editor の選択） */
    selected?: string;
    onpress?: (hotspot: Hotspot) => void;
    onselect?: (hotspot: Hotspot | undefined) => void;
    /** 画像と同じ座標系（viewBox）で描く層。引数は画像の大きさ */
    overlay?: Snippet<[{ width: number; height: number }]>;
  }

  let { manual, screen, baseUrl, hints = false, mode = 'play', selected, onpress, onselect, overlay }: Props = $props();

  const url = $derived(assetUrl(manual, screen.assetRef, baseUrl));
  const declared = $derived(assetSize(manual, screen.assetRef));
  let natural = $state<{ width: number; height: number } | undefined>();
  /** 画像の大きさ。素材の width / height（model 0.2.0）、無ければ読み込んだ画像の naturalWidth / naturalHeight */
  const size = $derived(declared ?? natural ?? { width: 1280, height: 1024 });

  let svg = $state<SVGSVGElement | undefined>();

  function onload(e: Event) {
    const img = e.currentTarget as HTMLImageElement;
    natural = { width: img.naturalWidth, height: img.naturalHeight };
  }

  /** 画面上の座標（clientX / clientY）→ 画像の座標 */
  export function toImage(x: number, y: number): { x: number; y: number } {
    const m = svg?.getScreenCTM();
    if (!m) return { x, y };
    const p = new DOMPoint(x, y).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  }

  /** 画像の座標 → 画面上の座標 */
  export function toScreen(x: number, y: number): { x: number; y: number } {
    const m = svg?.getScreenCTM();
    if (!m) return { x, y };
    const p = new DOMPoint(x, y).matrixTransform(m);
    return { x: p.x, y: p.y };
  }

  /** 画像の大きさ（editor が overlay の外で使う） */
  export function imageSize(): { width: number; height: number } {
    return size;
  }

  function activate(h: Hotspot) {
    if (mode === 'edit') onselect?.(h);
    else onpress?.(h);
  }

  function onkey(e: KeyboardEvent, h: Hotspot) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      activate(h);
    }
  }

  function onbackground(e: PointerEvent) {
    if (mode === 'edit' && e.target === svg) onselect?.(undefined);
  }

  const label = (h: Hotspot) => h.label || h.id;

  function rect(c: number[]) {
    const [x1 = 0, y1 = 0, x2 = 0, y2 = 0] = c;
    return { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
  }
  const points = (c: number[]) => c.join(' ');
</script>

<div class="em-stage" data-screen={screen.id}>
  {#if url}
    <img src={url} alt={screen.caption ?? screen.id} draggable="false" {onload} />
  {:else}
    <div class="missing" style="aspect-ratio: {size.width} / {size.height}">{screen.assetRef}</div>
  {/if}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <svg bind:this={svg} viewBox="0 0 {size.width} {size.height}" class:hints class:edit={mode === 'edit'} onpointerdown={onbackground}>
    {#each screen.hotspots as h (h.id)}
      <g
        class="hs {h.shape}"
        class:selected={h.id === selected}
        class:read={h.action === 'read'}
        role="button"
        tabindex="0"
        aria-label={label(h)}
        data-hotspot={h.id}
        onclick={(e) => {
          e.stopPropagation();
          activate(h);
        }}
        onkeydown={(e) => onkey(e, h)}
      >
        <title>{label(h)}</title>
        {#if h.shape === 'rect'}
          {@const r = rect(h.coords)}
          <rect x={r.x} y={r.y} width={r.width} height={r.height} rx="4" />
        {:else if h.shape === 'circle'}
          <circle cx={h.coords[0] ?? 0} cy={h.coords[1] ?? 0} r={h.coords[2] ?? 0} />
        {:else}
          <polygon points={points(h.coords)} />
        {/if}
      </g>
    {/each}
    {#if overlay}
      {@render overlay(size)}
    {/if}
  </svg>
</div>

<style>
  .em-stage {
    position: relative;
    width: 100%;
    line-height: 0;
    background: var(--em-surface-2, #eef1f5);
    border-radius: var(--em-radius, 6px);
    overflow: hidden;
  }
  img {
    display: block;
    width: 100%;
    height: auto;
    user-select: none;
    -webkit-user-drag: none;
  }
  .missing {
    display: grid;
    place-items: center;
    width: 100%;
    color: var(--em-muted, #5d6878);
    font: 0.9rem var(--em-font, system-ui, sans-serif);
    line-height: 1.4;
  }
  svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
  }
  .hs {
    cursor: pointer;
    outline: none;
  }
  .hs.read {
    cursor: help;
  }
  .hs rect,
  .hs circle,
  .hs polygon {
    fill: transparent;
    stroke: transparent;
    stroke-width: 3;
    vector-effect: non-scaling-stroke;
    transition:
      fill 120ms,
      stroke 120ms;
  }
  .hints .hs rect,
  .hints .hs circle,
  .hints .hs polygon {
    fill: var(--em-hotspot-fill, rgb(31 95 191 / 0.18));
    stroke: var(--em-hotspot-stroke, #1f5fbf);
    stroke-dasharray: 6 4;
  }
  .hs:hover rect,
  .hs:hover circle,
  .hs:hover polygon,
  .hs:focus-visible rect,
  .hs:focus-visible circle,
  .hs:focus-visible polygon {
    fill: var(--em-hotspot-fill, rgb(31 95 191 / 0.18));
    stroke: var(--em-hotspot-stroke, #1f5fbf);
    stroke-dasharray: none;
  }
  .hs.selected rect,
  .hs.selected circle,
  .hs.selected polygon {
    stroke: var(--em-hotspot-selected, #e0492b);
    fill: transparent;
  }
  .edit .hs {
    cursor: default;
  }
</style>
