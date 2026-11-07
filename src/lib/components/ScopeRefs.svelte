<!-- Topic・手順・画面に、適用範囲（Scope）を付け外しするチェック欄 -->
<script lang="ts">
  import { editor } from '$lib/state.svelte';
  import { getScopeRefs, setScopeRef, type ScopeTarget } from '$lib/ops';
  import { t } from '$lib/i18n';

  let { target }: { target: ScopeTarget } = $props();

  const scopes = $derived(editor.manual.scopes ?? []);
  const refs = $derived.by(() => {
    try {
      return new Set(getScopeRefs(editor.manual, target));
    } catch {
      return new Set<string>();
    }
  });
</script>

<fieldset class="scopes">
  <legend>{t('scope.refs')}</legend>
  {#if scopes.length === 0}
    <span class="muted small">{t('scope.noneDefined')}</span>
  {/if}
  {#each scopes as s (s.id)}
    <label class="chip">
      <input
        type="checkbox"
        checked={refs.has(s.id)}
        onchange={(e) => editor.apply((m) => setScopeRef(m, target, s.id, e.currentTarget.checked))}
      />
      {s.displayText}
      <span class="muted small">({s.property}: {s.values.join(', ')})</span>
    </label>
  {/each}
</fieldset>

<style>
  .scopes {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.2rem 0.5rem 0.4rem;
    margin: 0 0 0.5rem;
  }
  legend {
    font-size: 0.82rem;
    color: var(--muted);
    padding: 0 0.3rem;
  }
  .chip {
    display: inline-flex;
    gap: 0.3rem;
    align-items: center;
    margin-right: 0.8rem;
  }
</style>
