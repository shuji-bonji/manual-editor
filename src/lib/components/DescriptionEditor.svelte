<!--
  E-3 説明の編集（description）: blocks を見出し（section）・段落（para）・箇条書き（list）・表（table）・図（figure）・注意（admonition）の
  6 種から選んで足す、簡単なブロック編集。player の P-3（BlockView）と同じ上から下への並びで、その場で書く。
  - Block は id が無いことがあるので、木の中の位置（BlockPath）で指す（lib/ops.ts の addBlock ほか）。新しく足した Block には id を付ける。
  - section の中にも足せる（1 段）。並べ替えは ↑↓、削除は ×。
  - figure は素材のプルダウンに加え、素材の引き出しのカード（application/x-manual-asset）や画像ファイルのドロップを受ける。
  - Markdown の貼り付けから blocks への分解は後の版（設計書 E-3）。
-->
<script lang="ts">
  import { tick } from 'svelte';
  import type { AdmonitionLevel, Block, BlockKind, Topic } from '@shuji-bonji/experiential-manual-model';
  import { editor } from '$lib/state.svelte';
  import { addBlock, moveBlock, removeBlock, updateBlock, updateTopic, type BlockPath } from '$lib/ops';
  import { fileName } from '$lib/io';
  import { t } from '$lib/i18n';
  import ScopeRefs from './ScopeRefs.svelte';

  let { topic }: { topic: Topic } = $props();

  const kinds: BlockKind[] = ['section', 'para', 'list', 'table', 'figure', 'admonition'];
  const levels: AdmonitionLevel[] = ['warning', 'caution', 'note'];
  const blocks = $derived(topic.blocks ?? []);
  const assets = $derived(editor.manual.assets ?? []);

  let root = $state<HTMLElement | undefined>();
  let dropKey = $state<string | undefined>();
  const key = (path: BlockPath) => path.join('.');

  async function add(kind: BlockKind, parentPath?: BlockPath, index?: number) {
    const id = editor.apply((m) => addBlock(m, topic.id, kind, { parentPath, index }));
    if (!id) return;
    await tick();
    root?.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(id)}"] input, [data-block-id="${CSS.escape(id)}"] textarea, [data-block-id="${CSS.escape(id)}"] select`)?.focus();
  }
  const patch = (path: BlockPath, p: Parameters<typeof updateBlock>[3], coalesce?: string) => editor.apply((m) => updateBlock(m, topic.id, path, p), coalesce);

  // ---- 表 ----
  function setCell(path: BlockPath, rows: string[][], r: number, c: number, v: string) {
    const next = rows.map((row) => [...row]);
    next[r][c] = v;
    patch(path, { rows: next }, `cell:${key(path)}:${r}:${c}`);
  }
  function addRow(path: BlockPath, rows: string[][]) {
    patch(path, { rows: [...rows, Array.from({ length: rows[0]?.length ?? 2 }, () => '')] });
  }
  function addCol(path: BlockPath, rows: string[][]) {
    patch(path, { rows: rows.map((row) => [...row, '']) });
  }
  function removeRow(path: BlockPath, rows: string[][], r: number) {
    if (rows.length <= 1) return;
    patch(path, { rows: rows.filter((_, i) => i !== r) });
  }
  function removeCol(path: BlockPath, rows: string[][], c: number) {
    if ((rows[0]?.length ?? 0) <= 1) return;
    patch(path, { rows: rows.map((row) => row.filter((_, i) => i !== c)) });
  }

  // ---- 図のドロップ ----
  const ASSET = 'application/x-manual-asset';
  function onDragOver(e: DragEvent, path: BlockPath) {
    const types = e.dataTransfer?.types ?? [];
    if (!types.includes(ASSET) && !types.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'copy';
    dropKey = key(path);
  }
  async function onDrop(e: DragEvent, path: BlockPath) {
    dropKey = undefined;
    const assetId = e.dataTransfer?.getData(ASSET);
    const file = [...(e.dataTransfer?.files ?? [])].find((f) => f.type.startsWith('image/'));
    if (!assetId && !file) return;
    e.preventDefault();
    const id = assetId || (file ? await editor.addAssetFromFile(file) : undefined);
    if (id) patch(path, { assetRef: id });
  }
  const assetLabel = (id: string) => {
    const a = assets.find((x) => x.id === id);
    return a ? a.alt || fileName(a.source) || a.id : id;
  };
</script>

{#snippet addMenu(parentPath: BlockPath | undefined, compact: boolean)}
  <div class="addmenu" class:compact>
    <span class="muted small">{compact ? t('block.addInside') : t('block.add')}</span>
    {#each kinds as k (k)}
      {#if !(compact && k === 'section')}
        <button type="button" class="btn small" onclick={() => add(k, parentPath)} data-testid="add-block-{k}">{t(`block.kind.${k}`)}</button>
      {/if}
    {/each}
  </div>
{/snippet}

{#snippet blockNode(b: Block, path: BlockPath, index: number, siblings: number)}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="block kind-{b.kind}" class:dropping={dropKey === key(path)} data-block-id={b.id ?? key(path)} data-testid="block-{b.kind}">
    <div class="tools">
      <span class="kind">{t(`block.kind.${b.kind}`)}</span>
      <button type="button" class="mini" disabled={index === 0} onclick={() => editor.apply((m) => moveBlock(m, topic.id, path, -1))} aria-label={t('common.up')}>↑</button>
      <button type="button" class="mini" disabled={index === siblings - 1} onclick={() => editor.apply((m) => moveBlock(m, topic.id, path, 1))} aria-label={t('common.down')}>↓</button>
      <button type="button" class="mini danger" onclick={() => editor.apply((m) => removeBlock(m, topic.id, path))} aria-label={t('common.remove')}>×</button>
    </div>

    {#if b.kind === 'section'}
      <input type="text" class="heading" value={b.title ?? ''} placeholder={t('block.titlePlaceholder')} oninput={(e) => patch(path, { title: e.currentTarget.value }, `bt:${key(path)}`)} />
      <div class="children">
        {#each b.children ?? [] as c, i (c.id ?? `${key(path)}.${i}`)}
          {@render blockNode(c, [...path, i], i, b.children!.length)}
        {/each}
        {@render addMenu(path, true)}
      </div>
    {:else if b.kind === 'para'}
      <textarea rows="3" value={b.text ?? ''} placeholder={t('block.textPlaceholder')} oninput={(e) => patch(path, { text: e.currentTarget.value }, `bx:${key(path)}`)}></textarea>
    {:else if b.kind === 'list'}
      <label class="small muted check"><input type="checkbox" checked={b.ordered ?? false} onchange={(e) => patch(path, { ordered: e.currentTarget.checked })} /> {t('block.ordered')}</label>
      <textarea rows={Math.max(3, (b.items?.length ?? 0) + 1)} value={(b.items ?? []).join('\n')} placeholder={t('block.itemsPlaceholder')} oninput={(e) => patch(path, { items: e.currentTarget.value.split('\n') }, `bi:${key(path)}`)} onblur={(e) => patch(path, { items: e.currentTarget.value.split('\n').map((x) => x.trim()).filter(Boolean) })}></textarea>
    {:else if b.kind === 'table'}
      {@const rows = b.rows ?? [['']]}
      <div class="table-wrap">
        <table>
          <tbody>
            {#each rows as row, r (r)}
              <tr>
                {#each row as cell, c (c)}
                  <td class:th={r === 0}><input type="text" value={cell} aria-label={`${r + 1},${c + 1}`} oninput={(e) => setCell(path, rows, r, c, e.currentTarget.value)} /></td>
                {/each}
                <td class="rowtool"><button type="button" class="mini" onclick={() => removeRow(path, rows, r)} aria-label={t('block.removeRow')} disabled={rows.length <= 1}>×</button></td>
              </tr>
            {/each}
            <tr>
              {#each rows[0] ?? [] as _, c (c)}
                <td class="rowtool"><button type="button" class="mini" onclick={() => removeCol(path, rows, c)} aria-label={t('block.removeCol')} disabled={(rows[0]?.length ?? 0) <= 1}>×</button></td>
              {/each}
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="row">
        <button type="button" class="btn small" onclick={() => addRow(path, rows)}>{t('block.addRow')}</button>
        <button type="button" class="btn small" onclick={() => addCol(path, rows)}>{t('block.addCol')}</button>
        <span class="muted small">{t('block.tableHint')}</span>
      </div>
    {:else if b.kind === 'figure'}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="figure" ondragover={(e) => onDragOver(e, path)} ondragleave={() => (dropKey = undefined)} ondrop={(e) => onDrop(e, path)}>
        {#if b.assetRef && editor.images.get(b.assetRef)}
          <img src={editor.images.get(b.assetRef)} alt={assetLabel(b.assetRef)} />
        {:else}
          <div class="nofig muted small">{b.assetRef ? assetLabel(b.assetRef) : t('block.figureDrop')}</div>
        {/if}
        <select value={b.assetRef ?? ''} aria-label={t('block.figureAsset')} onchange={(e) => patch(path, { assetRef: e.currentTarget.value })} data-testid="figure-asset">
          <option value="">{t('block.figureNone')}</option>
          {#if b.assetRef && !assets.some((a) => a.id === b.assetRef)}<option value={b.assetRef}>{t('step.targetBroken', { id: b.assetRef })}</option>{/if}
          {#each assets as a (a.id)}<option value={a.id}>{a.alt || fileName(a.source) || a.id}{a.kind !== 'image' ? ` (${a.kind})` : ''}</option>{/each}
        </select>
      </div>
      <input type="text" value={b.title ?? ''} placeholder={t('block.figureTitle')} oninput={(e) => patch(path, { title: e.currentTarget.value }, `bt:${key(path)}`)} />
    {:else if b.kind === 'admonition'}
      <div class="adm level-{b.level ?? 'note'}">
        <div class="row">
          <select value={b.level ?? 'note'} aria-label={t('admonition.level')} onchange={(e) => patch(path, { level: e.currentTarget.value as AdmonitionLevel })}>
            {#each levels as l (l)}<option value={l}>{t(`level.${l}`)}</option>{/each}
          </select>
          <input type="text" value={b.title ?? ''} placeholder={t('block.admTitle')} oninput={(e) => patch(path, { title: e.currentTarget.value }, `bt:${key(path)}`)} />
        </div>
        <textarea rows="2" value={b.text ?? ''} placeholder={t('admonition.text')} oninput={(e) => patch(path, { text: e.currentTarget.value }, `bx:${key(path)}`)}></textarea>
      </div>
    {/if}
    <ScopeRefs target={{ kind: 'block', topicId: topic.id, path }} quiet compact />
  </div>
{/snippet}

<div class="desc" bind:this={root} data-testid="description-editor">
  <div class="panel head">
    <label class="field">
      <span class="caption">{t('topic.summary')}</span>
      <textarea rows="2" value={topic.summary ?? ''} oninput={(e) => editor.apply((m) => updateTopic(m, topic.id, { summary: e.currentTarget.value }), `topic-summary:${topic.id}`)}></textarea>
    </label>
    <ScopeRefs target={{ kind: 'topic', topicId: topic.id }} quiet />
  </div>

  {#if blocks.length === 0}
    <p class="muted">{t('block.empty')}</p>
  {/if}
  <div class="blocks">
    {#each blocks as b, i (b.id ?? String(i))}
      {@render blockNode(b, [i], i, blocks.length)}
    {/each}
  </div>
  {@render addMenu(undefined, false)}
</div>

<style>
  .head {
    margin-bottom: 0.5rem;
  }
  .blocks {
    display: grid;
    gap: 0.4rem;
    margin-bottom: 0.5rem;
  }
  .block {
    position: relative;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.5rem 0.6rem 0.4rem;
    display: grid;
    gap: 0.3rem;
  }
  .block.dropping {
    outline: 2px dashed var(--accent);
    outline-offset: -2px;
  }
  .block.kind-section {
    border-left: 3px solid var(--accent);
  }
  .tools {
    display: flex;
    gap: 0.1rem;
    align-items: center;
    justify-content: flex-end;
    font-size: 0.8rem;
    color: var(--muted);
    opacity: 0.6;
  }
  .block:hover > .tools,
  .block:focus-within > .tools {
    opacity: 1;
  }
  .kind {
    margin-right: auto;
  }
  .mini {
    font: inherit;
    font-size: 0.85rem;
    color: var(--muted);
    background: none;
    border: none;
    cursor: pointer;
    padding: 0 0.3rem;
  }
  .mini:disabled {
    opacity: 0.3;
    cursor: default;
  }
  .mini.danger:hover {
    color: var(--danger);
  }
  input.heading {
    font-size: 1.1rem;
    font-weight: 700;
  }
  .children {
    display: grid;
    gap: 0.4rem;
    padding-left: 0.8rem;
    border-left: 1px dashed var(--border);
  }
  .check {
    display: inline-flex;
    gap: 0.3rem;
    align-items: center;
  }
  .table-wrap {
    overflow: auto;
  }
  table {
    border-collapse: collapse;
  }
  td {
    padding: 0.1rem;
    border: 1px solid var(--border);
  }
  td.th {
    background: var(--surface-2);
  }
  td.th input {
    font-weight: 600;
  }
  td input[type='text'] {
    min-width: 7rem;
    border-color: transparent;
    background: transparent;
    padding: 0.2rem 0.3rem;
  }
  td input[type='text']:focus {
    border-color: var(--accent);
    background: var(--surface);
  }
  td.rowtool {
    border: none;
    text-align: center;
  }
  .figure {
    display: grid;
    gap: 0.3rem;
    justify-items: start;
  }
  .figure img {
    max-width: 100%;
    max-height: 16rem;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface-2);
  }
  .nofig {
    width: 100%;
    padding: 1rem;
    text-align: center;
    border: 1px dashed var(--border);
    border-radius: var(--radius);
  }
  .figure select {
    width: auto;
    max-width: 100%;
  }
  .adm {
    display: grid;
    gap: 0.3rem;
    padding-left: 0.5rem;
    border-left: 3px solid var(--border);
  }
  .adm.level-warning {
    border-left-color: var(--danger);
  }
  .adm.level-caution {
    border-left-color: var(--warn);
  }
  .adm select {
    width: 7rem;
    flex: none;
  }
  .addmenu {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    align-items: center;
  }
  .addmenu.compact .btn {
    font-size: 0.78rem;
    padding: 0.15rem 0.4rem;
  }
</style>
