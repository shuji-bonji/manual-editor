import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    // SPA として出力する。どの URL でも index.html を返す前提（GitHub Pages では 404.html を別に用意しない）。
    adapter: adapter({ pages: 'build', assets: 'build', fallback: 'index.html', precompress: false, strict: true }),
    paths: {
      // GitHub Pages のプロジェクトページでは "/リポジトリ名" になる。ビルド時に環境変数 BASE_PATH で与える。
      base: process.env.BASE_PATH ?? ''
    }
  }
};

export default config;
