<!--
  行き先（Transition.to）を選ぶプルダウン。手順の分岐（Step.next）・答え（Step.answers）・ホットスポットの遷移先で同じものを使う。
  並び: 同じ Topic の手順（番号付き）→ 画面の流れの Topic の画面 → 他の手順の Topic の手順。いまの値がどこにも無ければ「（参照切れ）」として残す。
-->
<script lang="ts">
  import { numberSteps } from '@shuji-bonji/experiential-manual-model';
  import { editor } from '$lib/state.svelte';
  import { t } from '$lib/i18n';

  interface Props {
    value: string;
    /** 選んでいる Topic（この Topic の手順を先頭に出す） */
    topicId: string;
    /** 選べないようにする id（自分自身） */
    excludeId?: string;
    allowEmpty?: boolean;
    label?: string;
    testid?: string;
    onchange: (to: string) => void;
  }
  let { value, topicId, excludeId, allowEmpty = false, label, testid, onchange }: Props = $props();

  const m = $derived(editor.manual);
  const own = $derived(m.topics.find((x) => x.id === topicId));
  const ownSteps = $derived(own?.steps ? numberSteps(own.steps).filter((n) => n.step.id !== excludeId) : []);
  const screenTopics = $derived(m.topics.filter((x) => x.screens?.length));
  const otherStepTopics = $derived(m.topics.filter((x) => x.id !== topicId && x.steps?.length));
  const known = $derived.by(() => {
    const ids = new Set<string>();
    for (const x of m.topics) {
      x.screens?.forEach((s) => ids.add(s.id));
      if (x.steps) numberSteps(x.steps).forEach((n) => ids.add(n.step.id));
    }
    return ids;
  });
  const short = (s: string, n = 28) => ([...s].length > n ? [...s].slice(0, n).join('') + '…' : s);
</script>

<select {value} aria-label={label ?? t('target.label')} data-testid={testid} onchange={(e) => onchange(e.currentTarget.value)}>
  {#if allowEmpty || value === ''}<option value="">{t('target.none')}</option>{/if}
  {#if value && !known.has(value)}<option value={value}>{t('hotspot.transitionBroken', { to: value })}</option>{/if}
  {#if ownSteps.length}
    <optgroup label={t('target.ownSteps')}>
      {#each ownSteps as n (n.step.id)}
        <option value={n.step.id}>{n.number} {short(n.step.question || n.step.text || n.step.id)}</option>
      {/each}
    </optgroup>
  {/if}
  {#each screenTopics as tp (tp.id)}
    <optgroup label="{t('target.screens')}: {tp.title}">
      {#each tp.screens ?? [] as s (s.id)}
        <option value={s.id}>{s.caption || s.id}</option>
      {/each}
    </optgroup>
  {/each}
  {#each otherStepTopics as tp (tp.id)}
    <optgroup label="{t('target.steps')}: {tp.title}">
      {#each numberSteps(tp.steps ?? []) as n (n.step.id)}
        <option value={n.step.id}>{n.number} {short(n.step.question || n.step.text || n.step.id)}</option>
      {/each}
    </optgroup>
  {/each}
</select>
