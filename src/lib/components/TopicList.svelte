<!-- Topic の一覧。追加・題名の編集・種類（kind）の選択・並べ替え・削除 -->
<script lang="ts">
  import type { TopicKind } from '@shuji-bonji/experiential-manual-model';
  import { editor } from '$lib/state.svelte';
  import { moveTopic, removeTopic, updateTopic } from '$lib/ops';
  import { t } from '$lib/i18n';

  const kinds: TopicKind[] = ['description', 'procedure', 'screenFlow', 'troubleshooting'];
  let newKind = $state<TopicKind>('screenFlow');

  function remove(id: string, title: string) {
    if (!confirm(t('topic.confirmRemove', { title }))) return;
    editor.apply((m) => removeTopic(m, id));
    editor.fixSelection();
  }
</script>

<section class="panel" aria-labelledby="topics-h">
  <h2 id="topics-h">{t('topic.heading')}</h2>

  {#if editor.manual.topics.length === 0}
    <p class="muted small">{t('topic.empty')}</p>
  {/if}

  <ul class="list">
    {#each editor.manual.topics as topic, i (topic.id)}
      <li class:selected={topic.id === editor.selection.topicId}>
        <div class="item">
          <button
            class="pick"
            type="button"
            onclick={() => {
              editor.selectTopic(topic.id);
              editor.tab = 'edit';
            }}
            aria-pressed={topic.id === editor.selection.topicId}
            aria-label={t('topic.select', { title: topic.title })}
          >
            <span class="badge">{t(`kind.${topic.kind}`)}</span>
          </button>
          <input
            type="text"
            value={topic.title}
            aria-label={t('topic.title')}
            oninput={(e) => editor.apply((m) => updateTopic(m, topic.id, { title: e.currentTarget.value }), `topic-title:${topic.id}`)}
          />
        </div>
        <div class="row actions">
          <select
            aria-label={t('topic.kind')}
            value={topic.kind}
            onchange={(e) => editor.apply((m) => updateTopic(m, topic.id, { kind: e.currentTarget.value as TopicKind }))}
          >
            {#each kinds as k (k)}
              <option value={k}>{t(`kind.${k}`)}</option>
            {/each}
          </select>
          <button class="btn small" type="button" disabled={i === 0} onclick={() => editor.apply((m) => moveTopic(m, topic.id, -1))} aria-label={t('common.up')}>↑</button>
          <button
            class="btn small"
            type="button"
            disabled={i === editor.manual.topics.length - 1}
            onclick={() => editor.apply((m) => moveTopic(m, topic.id, 1))}
            aria-label={t('common.down')}>↓</button>
          <button class="btn small danger" type="button" onclick={() => remove(topic.id, topic.title)}>{t('common.remove')}</button>
        </div>
      </li>
    {/each}
  </ul>

  <div class="row add">
    <select bind:value={newKind} aria-label={t('topic.newKind')}>
      {#each kinds as k (k)}
        <option value={k}>{t(`kind.${k}`)}</option>
      {/each}
    </select>
    <button class="btn primary" type="button" onclick={() => editor.createTopic(newKind)}>{t('topic.add')}</button>
  </div>
</section>

<style>
  .item {
    display: flex;
    gap: 0.4rem;
    align-items: center;
    padding: 0.4rem 0.4rem 0.2rem;
  }
  .pick {
    border: 0;
    background: none;
    cursor: pointer;
    padding: 0;
  }
  .actions {
    padding: 0 0.4rem 0.4rem;
  }
  .actions select {
    width: auto;
    flex: 1;
    min-width: 7rem;
  }
  .add {
    margin-top: 0.5rem;
  }
  .add select {
    flex: 1;
    width: auto;
  }
</style>
