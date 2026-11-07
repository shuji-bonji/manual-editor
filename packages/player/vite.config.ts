/**
 * Web Components（<experiential-manual>）のビルド。dist/element/experiential-manual.js に 1 ファイルで出す。
 * 部品を Svelte のまま使う側（editor）はこのビルドを使わず、src/components を直接読む。
 */
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [svelte({ compilerOptions: { customElement: true } })],
  build: {
    outDir: 'dist/element',
    emptyOutDir: true,
    sourcemap: true,
    lib: {
      entry: 'src/element.ts',
      formats: ['es'],
      fileName: () => 'experiential-manual.js'
    }
  }
});
