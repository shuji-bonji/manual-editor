<!--
  Topic の中身。kind で表示を切り替える。いまは screenFlow（P-1）だけ。P-2 / P-3 / P-4 は手順 4 で足す。
-->
<script lang="ts">
  import type { Manual, Topic } from '@shuji-bonji/experiential-manual-model';
  import type { Target } from '../runtime/lookup.js';
  import type { ScopeSelection } from '../runtime/scope.js';
  import ScreenFlow from './ScreenFlow.svelte';
  import { t, type Lang } from './text.js';

  interface Props {
    manual: Manual;
    topic: Topic;
    startScreen?: string;
    scope?: ScopeSelection;
    hints?: boolean;
    baseUrl?: string | URL;
    lang?: Lang;
    onleave?: (target: Target) => void;
  }
  let { manual, topic, startScreen, scope = {}, hints = $bindable(false), baseUrl, lang = 'ja', onleave }: Props = $props();
</script>

{#if topic.kind === 'screenFlow'}
  <ScreenFlow {manual} topicId={topic.id} {startScreen} {scope} bind:hints {baseUrl} {lang} {onleave} />
{:else}
  <section class="em-topic">
    <h2>{topic.title}</h2>
    {#if topic.summary}<p>{topic.summary}</p>{/if}
    <p class="muted">{t(lang, 'topic.notYet', { kind: t(lang, `kind.${topic.kind}`) })}</p>
  </section>
{/if}

<style>
  .em-topic {
    font: 0.95rem/1.6 var(--em-font, system-ui, sans-serif);
    color: var(--em-text, #1c2330);
  }
  h2 {
    margin: 0 0 0.5rem;
    font-size: 1.2rem;
  }
  .muted {
    color: var(--em-muted, #5d6878);
  }
</style>
