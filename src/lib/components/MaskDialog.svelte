<!--
  E-6 のマスク（U-16）: 画像の一部を塗りつぶして個人情報などを隠す。
  画像を <canvas> に描き、ドラッグで囲んだ矩形を塗りつぶし、「適用」で PNG にして editor.maskAsset に渡す（元の画像は残さない）。
  矩形の座標は画像の画素で持ち、表示は CSS で縮める（EditStage と同じ考え方）。
-->
<script lang="ts">
  import { editor } from '$lib/state.svelte';
  import { fileName } from '$lib/io';
  import { t } from '$lib/i18n';

  let { assetId, onclose }: { assetId: string; onclose: () => void } = $props();

  type Rect = { x: number; y: number; w: number; h: number };
  const asset = $derived(editor.manual.assets?.find((a) => a.id === assetId));
  const url = $derived(editor.images.get(assetId));
  const size = $derived(editor.sizes.get(assetId));

  let dialog = $state<HTMLDialogElement | undefined>();
  let img = $state<HTMLImageElement | undefined>();
  let rects = $state<Rect[]>([]);
  let drawing = $state<{ x0: number; y0: number; x1: number; y1: number } | undefined>();
  let busy = $state(false);

  $effect(() => {
    dialog?.showModal();
  });

  function toImage(e: PointerEvent): { x: number; y: number } {
    if (!img || !size) return { x: 0, y: 0 };
    const r = img.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * size.w;
    const y = ((e.clientY - r.top) / r.height) * size.h;
    return { x: Math.min(size.w, Math.max(0, x)), y: Math.min(size.h, Math.max(0, y)) };
  }
  function down(e: PointerEvent) {
    if (e.button !== 0) return;
    const p = toImage(e);
    drawing = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent) {
    if (!drawing) return;
    const p = toImage(e);
    drawing = { ...drawing, x1: p.x, y1: p.y };
  }
  function up() {
    if (!drawing) return;
    const r = norm(drawing);
    drawing = undefined;
    if (r.w >= 2 && r.h >= 2) rects = [...rects, r];
  }
  const norm = (d: { x0: number; y0: number; x1: number; y1: number }): Rect => ({
    x: Math.round(Math.min(d.x0, d.x1)),
    y: Math.round(Math.min(d.y0, d.y1)),
    w: Math.round(Math.abs(d.x1 - d.x0)),
    h: Math.round(Math.abs(d.y1 - d.y0))
  });

  async function apply() {
    if (!url || !size || rects.length === 0) return;
    busy = true;
    try {
      const source = new Image();
      source.decoding = 'async';
      await new Promise<void>((resolve, reject) => {
        source.onload = () => resolve();
        source.onerror = () => reject(new Error('load'));
        source.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = size.w;
      canvas.height = size.h;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('canvas');
      ctx.drawImage(source, 0, 0, size.w, size.h);
      ctx.fillStyle = '#000';
      for (const r of rects) ctx.fillRect(r.x, r.y, r.w, r.h);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('blob');
      await editor.maskAsset(assetId, blob);
      close();
    } catch {
      editor.notify('error', t('assets.maskFailed'));
    } finally {
      busy = false;
    }
  }

  function close() {
    dialog?.close();
    onclose();
  }
</script>

<dialog bind:this={dialog} class="mask" onclose={onclose} oncancel={(e) => (e.preventDefault(), close())} aria-label={t('assets.maskTitle', { name: asset?.alt || (asset ? fileName(asset.source) : '') || assetId })}>
  <div class="row spread head">
    <strong>{t('assets.maskTitle', { name: asset?.alt || (asset ? fileName(asset.source) : '') || assetId })}</strong>
    <button type="button" class="btn small" onclick={close} aria-label={t('common.close')}>×</button>
  </div>
  <p class="muted small">{t('assets.maskHelp')}</p>
  {#if url && size}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="canvas" onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up} data-testid="mask-canvas">
      <img bind:this={img} src={url} alt="" draggable="false" />
      <!-- 画像と同じ大きさに重ね、viewBox で画像の画素の座標をそのまま使う -->
      <svg class="overlay" viewBox="0 0 {size.w} {size.h}" preserveAspectRatio="none" aria-hidden="true">
        {#each rects as r, i (i)}
          <rect x={r.x} y={r.y} width={r.w} height={r.h} class="fill" />
        {/each}
        {#if drawing}
          {@const r = norm(drawing)}
          <rect x={r.x} y={r.y} width={r.w} height={r.h} class="preview" />
        {/if}
      </svg>
    </div>
  {:else}
    <p class="muted">{t('assets.noImage')}</p>
  {/if}
  <div class="row spread foot">
    <span class="muted small">{rects.length === 0 ? t('assets.maskNone') : t('assets.maskCount', { n: rects.length })}</span>
    <div class="row">
      <button type="button" class="btn small" disabled={rects.length === 0} onclick={() => (rects = rects.slice(0, -1))}>{t('assets.maskUndo')}</button>
      <button type="button" class="btn small" disabled={rects.length === 0} onclick={() => (rects = [])}>{t('assets.maskClear')}</button>
      <button type="button" class="btn small primary" disabled={rects.length === 0 || busy} onclick={apply} data-testid="mask-apply">{t('assets.maskApply')}</button>
    </div>
  </div>
</dialog>

<style>
  .mask {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--text);
    padding: var(--gap);
    width: min(92vw, 1000px);
    max-height: 92vh;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .mask::backdrop {
    background: rgb(0 0 0 / 0.45);
  }
  .head strong {
    font-size: 0.95rem;
  }
  .canvas {
    position: relative;
    align-self: center;
    max-width: 100%;
    max-height: 65vh;
    cursor: crosshair;
    user-select: none;
    touch-action: none;
    line-height: 0;
  }
  .canvas img {
    max-width: 100%;
    max-height: 65vh;
    display: block;
  }
  .overlay {
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }
  .fill {
    fill: #000;
  }
  .preview {
    fill: rgb(0 0 0 / 0.5);
    stroke: var(--accent);
    stroke-width: 2;
    vector-effect: non-scaling-stroke;
  }
  .foot {
    border-top: 1px solid var(--border);
    padding-top: 0.5rem;
  }
</style>
