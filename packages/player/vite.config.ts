/**
 * Web Components（<experiential-manual>）のビルド。dist/element/ に 2 つの形で、それぞれ 1 ファイルで出す。
 * - experiential-manual.js: ES モジュール。<script type="module"> か import で読む。
 * - experiential-manual.iife.js: モジュールでない形。<script> で読むと <experiential-manual> が登録され、
 *   runtime の関数は window.ExperientialManual に入る。file:// で開く HTML（ES モジュールを読み込めない）に埋め込むために使う。
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
      formats: ['es', 'iife'],
      name: 'ExperientialManual',
      fileName: (format) => (format === 'iife' ? 'experiential-manual.iife.js' : 'experiential-manual.js')
    }
  }
});
