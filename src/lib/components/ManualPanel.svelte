<!-- インスペクターの「マニュアル」: 題名・言語・版・説明と、適用範囲（Scope）の作成。構成ツリーの「マニュアル」を選ぶと出る -->
<script lang="ts">
  import { editor } from '$lib/state.svelte';
  import { addScope, removeScope, updateManual, updateScope } from '$lib/ops';
  import { t } from '$lib/i18n';

  const m = $derived(editor.manual);

  const splitValues = (s: string) =>
    s
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
</script>

<div class="stack">
  <section aria-labelledby="meta-h">
    <h3 id="meta-h">{t('library.meta')}</h3>
    <label class="field">
      <span class="caption">{t('manual.title')}</span>
      <input type="text" value={m.title} oninput={(e) => editor.apply((x) => updateManual(x, { title: e.currentTarget.value }), 'manual-title')} data-testid="manual-title" />
    </label>
    <label class="field">
      <span class="caption">{t('manual.language')}</span>
      <input type="text" value={m.language} oninput={(e) => editor.apply((x) => updateManual(x, { language: e.currentTarget.value }), 'manual-lang')} />
    </label>
    <div class="two">
      <label class="field">
        <span class="caption">{t('manual.version')}</span>
        <input type="text" value={m.version.number} oninput={(e) => editor.apply((x) => updateManual(x, { versionNumber: e.currentTarget.value }), 'manual-ver')} />
      </label>
      <label class="field">
        <span class="caption">{t('manual.versionDate')}</span>
        <input type="text" placeholder="YYYY-MM-DD" value={m.version.date ?? ''} oninput={(e) => editor.apply((x) => updateManual(x, { versionDate: e.currentTarget.value }), 'manual-date')} />
      </label>
    </div>
    <label class="field">
      <span class="caption">{t('manual.description')}</span>
      <textarea rows="3" value={m.description ?? ''} oninput={(e) => editor.apply((x) => updateManual(x, { description: e.currentTarget.value }), 'manual-desc')}></textarea>
    </label>
  </section>

  <section aria-labelledby="scopes-h">
    <h3 id="scopes-h">{t('library.scopes')}</h3>
    <p class="muted small">{t('library.scopesHelp')}</p>
    {#each m.scopes ?? [] as s (s.id)}
      <div class="scope" data-testid="scope">
        <label class="field">
          <span class="caption">{t('scope.displayText')}</span>
          <input type="text" value={s.displayText} oninput={(e) => editor.apply((x) => updateScope(x, s.id, { displayText: e.currentTarget.value }), `scope-dt:${s.id}`)} />
        </label>
        <div class="two">
          <label class="field">
            <span class="caption">{t('scope.property')}</span>
            <input type="text" value={s.property} oninput={(e) => editor.apply((x) => updateScope(x, s.id, { property: e.currentTarget.value }), `scope-pr:${s.id}`)} />
          </label>
          <label class="field">
            <span class="caption">{t('scope.values')}</span>
            <input type="text" value={s.values.join(', ')} onchange={(e) => editor.apply((x) => updateScope(x, s.id, { values: splitValues(e.currentTarget.value) }))} />
          </label>
        </div>
        <button class="btn small danger" type="button" onclick={() => confirm(t('scope.confirmRemove', { name: s.displayText })) && editor.apply((x) => removeScope(x, s.id))}>{t('common.remove')}</button>
      </div>
    {/each}
    <button class="btn small" type="button" data-testid="add-scope" onclick={() => editor.apply((x) => addScope(x, { property: 'model', values: ['MV-50'], displayText: t('scope.newName', { n: (x.scopes?.length ?? 0) + 1 }) }))}>{t('scope.add')}</button>
  </section>
</div>

<style>
  .stack {
    display: grid;
    gap: 0.8rem;
  }
  h3 {
    font-size: 0.85rem;
    margin: 0 0 0.4rem;
    color: var(--muted);
  }
  .two {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0 0.5rem;
  }
  .scope {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.5rem;
    margin-bottom: 0.5rem;
  }
</style>
