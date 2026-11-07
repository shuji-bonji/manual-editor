<!--
  Topic の中身。kind で表示を切り替える。
  screenFlow → ScreenFlow（P-1）、procedure → ProcedureView（P-2）、description → BlockView（P-3）、troubleshooting → FaultTree（P-4）。
-->
<script lang="ts">
  import type { Manual, Topic } from '@shuji-bonji/experiential-manual-model';
  import type { Target } from '../runtime/lookup.js';
  import { applicableBlocks, type ScopeSelection } from '../runtime/scope.js';
  import BlockView from './BlockView.svelte';
  import FaultTree from './FaultTree.svelte';
  import ProcedureView from './ProcedureView.svelte';
  import ScreenFlow from './ScreenFlow.svelte';
  import { t, type Lang } from './text.js';

  interface Props {
    manual: Manual;
    topic: Topic;
    /** screenFlow で最初に開く画面の id */
    startScreen?: string;
    /** procedure で最初に選ぶ手順の id */
    startStep?: string;
    scope?: ScopeSelection;
    hints?: boolean;
    baseUrl?: string | URL;
    lang?: Lang;
    onleave?: (target: Target) => void;
  }
  let { manual, topic, startScreen, startStep, scope = {}, hints = $bindable(false), baseUrl, lang = 'ja', onleave }: Props =
    $props();

  const blocks = $derived(applicableBlocks(manual, topic.blocks ?? [], scope));
</script>

{#if topic.kind === 'screenFlow'}
  <ScreenFlow {manual} topicId={topic.id} {startScreen} {scope} bind:hints {baseUrl} {lang} {onleave} />
{:else if topic.kind === 'procedure'}
  <ProcedureView {manual} {topic} {startStep} {scope} {baseUrl} {lang} {onleave} />
{:else if topic.kind === 'troubleshooting'}
  <FaultTree {manual} {topic} {scope} {baseUrl} {lang} {onleave} />
{:else if topic.kind === 'description'}
  <section class="em-topic">
    <h2>{topic.title}</h2>
    {#if topic.summary}<p class="summary">{topic.summary}</p>{/if}
    <BlockView {manual} {blocks} {baseUrl} {lang} />
  </section>
{:else}
  <section class="em-topic">
    <h2>{topic.title}</h2>
    <p class="muted">{t(lang, 'topic.notYet', { kind: topic.kind })}</p>
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
  .summary {
    margin: 0 0 0.75rem;
    color: var(--em-muted, #5d6878);
  }
  .muted {
    color: var(--em-muted, #5d6878);
  }
</style>
