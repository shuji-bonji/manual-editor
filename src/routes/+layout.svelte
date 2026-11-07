<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';

  let { children } = $props();

  // PWA: service worker を登録する。開発サーバーでは vite.config.ts の devOptions で無効にしてある
  onMount(async () => {
    try {
      const { registerSW } = await import('virtual:pwa-register');
      registerSW({ immediate: true });
    } catch {
      /* service worker が使えない環境では、通常の Web ページとして動く */
    }
  });
</script>

{@render children()}
