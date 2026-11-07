<!--
  P-0 外枠: 題名・版・適用範囲・用語集のヘッダーと、目次と、選んだ Topic の中身。
  chrome="none" で外枠を出さず、中身（TopicView）だけを出す（埋め込み用）。
  色のトークン（--em-*）の既定はここで定義する。外から同じ名前で上書きできる。
-->
<script lang="ts">
  import type { Manual, TopicKind } from '@shuji-bonji/experiential-manual-model';
  import type { Target } from '../runtime/lookup.js';
  import { applicableTopics, listScopeProperties, type ScopeSelection } from '../runtime/scope.js';
  import { t, type Lang } from './text.js';
  import TopicView from './TopicView.svelte';

  interface Props {
    manual: Manual;
    /** 開いている Topic の id。省くと先頭 */
    topic?: string;
    /** 最初に開く画面の id（screenFlow のとき） */
    screen?: string;
    scope?: ScopeSelection;
    hints?: boolean;
    chrome?: 'full' | 'none';
    baseUrl?: string | URL;
    lang?: Lang;
  }

  let {
    manual,
    topic = $bindable(),
    screen,
    scope = $bindable({}),
    hints = $bindable(false),
    chrome = 'full',
    baseUrl,
    lang = 'ja'
  }: Props = $props();

  const topics = $derived(applicableTopics(manual, scope));
  const current = $derived(topics.find((x) => x.id === topic) ?? manual.topics.find((x) => x.id === topic) ?? topics[0]);
  const properties = $derived(listScopeProperties(manual));
  let glossaryOpen = $state(false);

  const marks: Record<TopicKind, string> = { screenFlow: '▣', procedure: '≡', description: '¶', troubleshooting: '?' };

  function choose(id: string) {
    topic = id;
    screen = undefined;
  }

  function setScope(property: string, value: string) {
    const next: Record<string, string> = { ...scope };
    if (value === '') delete next[property];
    else next[property] = value;
    scope = next;
  }

  function leave(target: Target) {
    // 行き先が別の Topic の手順なら、その Topic を開く
    topic = target.topic.id;
    screen = target.kind === 'screen' ? target.screen.id : undefined;
  }
</script>

<div class="em-root" class:bare={chrome === 'none'} lang={lang}>
  {#if chrome !== 'none'}
    <header class="top">
      <h1>{manual.title}</h1>
      <span class="version">{t(lang, 'nav.version')} {manual.version.number}{manual.version.date ? `（${manual.version.date}）` : ''}</span>
      <div class="tools">
        {#each properties as p (p.property)}
          <label>
            <span>{t(lang, 'nav.scope')}: {p.property}</span>
            <select value={scope[p.property] ?? ''} onchange={(e) => setScope(p.property, e.currentTarget.value)}>
              <option value="">{t(lang, 'nav.scopeAny')}</option>
              {#each p.values as v (v.value)}
                <option value={v.value}>{v.displayText}</option>
              {/each}
            </select>
          </label>
        {/each}
        {#if manual.glossary && manual.glossary.length > 0}
          <button type="button" aria-expanded={glossaryOpen} onclick={() => (glossaryOpen = !glossaryOpen)}>{t(lang, 'nav.glossary')}</button>
        {/if}
      </div>
    </header>
    <div class="columns">
      <nav class="toc" aria-label={t(lang, 'nav.contents')}>
        <h2>{t(lang, 'nav.contents')}</h2>
        <ul>
          {#each topics as x (x.id)}
            <li>
              <button type="button" class:current={x.id === current?.id} onclick={() => choose(x.id)}>
                <span class="mark" title={t(lang, `kind.${x.kind}`)}>{marks[x.kind]}</span>
                {x.title}
              </button>
            </li>
          {/each}
        </ul>
      </nav>
      <main class="content">
        {#if glossaryOpen}
          <dl class="glossary">
            {#each manual.glossary ?? [] as g (g.term)}
              <dt>{g.term}</dt>
              <dd>{g.definition}</dd>
            {/each}
          </dl>
        {/if}
        {#if current}
          {#key current.id}
            <TopicView {manual} topic={current} startScreen={screen} {scope} bind:hints {baseUrl} {lang} onleave={leave} />
          {/key}
        {/if}
      </main>
    </div>
  {:else if current}
    {#key current.id}
      <TopicView {manual} topic={current} startScreen={screen} {scope} bind:hints {baseUrl} {lang} onleave={leave} />
    {/key}
  {/if}
</div>

<style>
  :host,
  .em-root {
    --em-bg: #f6f7f9;
    --em-surface: #ffffff;
    --em-surface-2: #eef1f5;
    --em-text: #1c2330;
    --em-muted: #5d6878;
    --em-border: #d3d9e2;
    --em-accent: #1f5fbf;
    --em-accent-soft: #dbe8fb;
    --em-danger-soft: #fde4e2;
    --em-warn: #8a5a00;
    --em-warn-soft: #fff1d1;
    --em-hotspot-fill: rgb(31 95 191 / 0.18);
    --em-hotspot-stroke: #1f5fbf;
    --em-hotspot-selected: #e0492b;
    --em-radius: 6px;
    --em-font: system-ui, -apple-system, 'Hiragino Sans', 'Yu Gothic UI', 'Noto Sans JP', sans-serif;
  }
  @media (prefers-color-scheme: dark) {
    :host,
    .em-root {
      --em-bg: #12161c;
      --em-surface: #1a2029;
      --em-surface-2: #232b37;
      --em-text: #e6eaf0;
      --em-muted: #9aa5b5;
      --em-border: #36404e;
      --em-accent: #6ea5ff;
      --em-accent-soft: #1f3354;
      --em-danger-soft: #4a1f1c;
      --em-warn: #f2c15c;
      --em-warn-soft: #43360f;
      --em-hotspot-fill: rgb(110 165 255 / 0.22);
      --em-hotspot-stroke: #6ea5ff;
      --em-hotspot-selected: #ff7a5c;
    }
  }
  .em-root {
    display: block;
    font: 0.95rem/1.6 var(--em-font);
    color: var(--em-text);
    background: var(--em-bg);
    border-radius: var(--em-radius);
    container-type: inline-size;
  }
  .em-root.bare {
    background: transparent;
  }
  .top {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 1rem;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--em-border);
  }
  h1 {
    margin: 0;
    font-size: 1.25rem;
  }
  .version {
    color: var(--em-muted);
    font-size: 0.85rem;
  }
  .tools {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 1rem;
    margin-left: auto;
    font-size: 0.85rem;
  }
  .tools label {
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }
  select,
  .tools button,
  .toc button {
    font: inherit;
    color: inherit;
    border: 1px solid var(--em-border);
    border-radius: var(--em-radius);
    background: var(--em-surface);
    padding: 0.25rem 0.5rem;
    cursor: pointer;
  }
  .columns {
    display: grid;
    grid-template-columns: 14rem minmax(0, 1fr);
    gap: 0;
  }
  @container (max-width: 48rem) {
    .columns {
      grid-template-columns: minmax(0, 1fr);
    }
    .toc {
      border-right: none !important;
      border-bottom: 1px solid var(--em-border);
    }
  }
  .toc {
    padding: 0.75rem;
    border-right: 1px solid var(--em-border);
  }
  .toc h2 {
    margin: 0 0 0.5rem;
    font-size: 0.8rem;
    color: var(--em-muted);
    font-weight: 600;
  }
  .toc ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.25rem;
  }
  .toc button {
    width: 100%;
    text-align: left;
    border-color: transparent;
    background: transparent;
    display: flex;
    gap: 0.4rem;
    align-items: baseline;
  }
  .toc button:hover {
    background: var(--em-surface-2);
  }
  .toc button.current {
    background: var(--em-accent-soft);
    color: var(--em-accent);
    font-weight: 600;
  }
  .mark {
    width: 1.1em;
    text-align: center;
    color: var(--em-muted);
    font-size: 0.85em;
  }
  .content {
    padding: 1rem;
    min-width: 0;
  }
  .glossary {
    margin: 0 0 1rem;
    padding: 0.75rem 1rem;
    border: 1px solid var(--em-border);
    border-radius: var(--em-radius);
    background: var(--em-surface);
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 0.25rem 1rem;
  }
  .glossary dt {
    font-weight: 600;
  }
  .glossary dd {
    margin: 0;
  }
</style>
