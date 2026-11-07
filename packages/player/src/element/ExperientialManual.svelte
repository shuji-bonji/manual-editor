<!--
  Web Components の入口 <experiential-manual>。
  属性: src（Manual の JSON の URL）、topic、screen、scope（model=MV-50 の形）、hints、chrome="none"、lang。
  JavaScript から manual プロパティに Manual のオブジェクトを渡すこともできる（src より優先）。
  スタイルは Shadow DOM の中に閉じ、色は --em-* のカスタムプロパティで外から変えられる。
-->
<svelte:options
  customElement={{
    tag: 'experiential-manual',
    shadow: 'open',
    props: {
      src: { attribute: 'src', type: 'String' },
      topic: { attribute: 'topic', type: 'String' },
      screen: { attribute: 'screen', type: 'String' },
      scope: { attribute: 'scope', type: 'String' },
      hints: { attribute: 'hints', type: 'Boolean' },
      chrome: { attribute: 'chrome', type: 'String' },
      lang: { attribute: 'lang', type: 'String' },
      manual: { type: 'Object' }
    }
  }}
/>

<script lang="ts">
  import type { Manual } from '@shuji-bonji/experiential-manual-model';
  import { parseScopeSelection, type ScopeSelection } from '../runtime/scope.js';
  import Frame from '../components/Frame.svelte';
  import { t, toLang } from '../components/text.js';

  interface Props {
    src?: string;
    topic?: string;
    screen?: string;
    scope?: string;
    hints?: boolean;
    chrome?: string;
    lang?: string;
    manual?: Manual;
  }
  let { src, topic, screen, scope, hints = false, chrome, lang, manual }: Props = $props();

  let loaded = $state<Manual | undefined>();
  let error = $state('');
  let baseUrl = $state<string | undefined>();

  $effect(() => {
    if (manual) {
      loaded = manual;
      error = '';
      return;
    }
    if (!src) return;
    const url = new URL(src, document.baseURI).href;
    baseUrl = url;
    let alive = true;
    fetch(url)
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return (await res.json()) as Manual;
      })
      .then((m) => {
        if (!alive) return;
        loaded = m;
        error = '';
      })
      .catch((e: unknown) => {
        if (!alive) return;
        error = e instanceof Error ? e.message : String(e);
      });
    return () => {
      alive = false;
    };
  });

  const language = $derived(toLang(lang));
  let selection = $state<ScopeSelection>({});
  $effect(() => {
    selection = parseScopeSelection(scope);
  });
  let currentTopic = $state<string | undefined>();
  $effect(() => {
    currentTopic = topic;
  });
  let showHints = $state(false);
  $effect(() => {
    showHints = hints;
  });
</script>

{#if error}
  <p class="em-error">{t(language, 'manual.error', { message: error })}</p>
{:else if loaded}
  <Frame
    manual={loaded}
    bind:topic={currentTopic}
    {screen}
    bind:scope={selection}
    bind:hints={showHints}
    chrome={chrome === 'none' ? 'none' : 'full'}
    {baseUrl}
    lang={language}
  />
{:else}
  <p class="em-loading">{t(language, 'manual.loading')}</p>
{/if}

<style>
  :host {
    display: block;
  }
  .em-error,
  .em-loading {
    font: 0.95rem/1.6 system-ui, sans-serif;
    color: #5d6878;
    margin: 0;
    padding: 0.5rem;
  }
  .em-error {
    color: #b3261e;
  }
</style>
