<!-- 警告・注意・備考の一覧。画面（P-1）、手順（P-2）、説明（P-3）で共通。 -->
<script lang="ts">
  import type { Admonition } from '@shuji-bonji/experiential-manual-model';
  import { t, type Lang } from './text.js';

  interface Props {
    items: Admonition[] | undefined;
    lang?: Lang;
  }
  let { items, lang = 'ja' }: Props = $props();
</script>

{#each items ?? [] as a, i (i)}
  <p class="em-adm {a.level}">
    <strong>{a.title ?? t(lang, `level.${a.level}`)}</strong>
    {a.text}
  </p>
{/each}

<style>
  .em-adm {
    margin: 0.4rem 0;
    padding: 0.4rem 0.6rem;
    border-radius: var(--em-radius, 6px);
    background: var(--em-surface-2, #eef1f5);
    border-left: 3px solid var(--em-border, #d3d9e2);
  }
  .em-adm strong {
    margin-right: 0.4em;
  }
  .em-adm.warning {
    background: var(--em-danger-soft, #fde4e2);
    border-left-color: var(--em-danger, #b3261e);
  }
  .em-adm.caution {
    background: var(--em-warn-soft, #fff1d1);
    border-left-color: var(--em-warn, #8a5a00);
  }
</style>
