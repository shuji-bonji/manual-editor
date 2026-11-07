<!-- description の Topic。試作では概要と適用範囲だけを編集できる（本文 Block の編集は見送り） -->
<script lang="ts">
  import type { Topic } from '@shuji-bonji/experiential-manual-model';
  import { editor } from '$lib/state.svelte';
  import { updateTopic } from '$lib/ops';
  import { t } from '$lib/i18n';
  import ScopeRefs from './ScopeRefs.svelte';

  let { topic, compact = false }: { topic: Topic; compact?: boolean } = $props();
</script>

<div class="panel">
  <label class="field">
    <span class="caption">{t('topic.summary')}</span>
    <textarea value={topic.summary ?? ''} oninput={(e) => editor.apply((m) => updateTopic(m, topic.id, { summary: e.currentTarget.value }), `topic-summary:${topic.id}`)}></textarea>
  </label>
  <ScopeRefs target={{ kind: 'topic', topicId: topic.id }} />
  {#if !compact}<p class="muted small">{t('description.notSupported', { n: topic.blocks?.length ?? 0 })}</p>{/if}
</div>
