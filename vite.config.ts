import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig } from 'vitest/config';

// GitHub Pages では BASE_PATH="/manual-editor" のようにリポジトリ名を与える。空ならルートに置く。
const base = process.env.BASE_PATH ?? '';

export default defineConfig({
  plugins: [
    sveltekit(),
    SvelteKitPWA({
      // 新しい版の service worker を自動で有効にする。編集中のデータは localStorage の下書きに残る。
      registerType: 'autoUpdate',
      strategies: 'generateSW',
      kit: { adapterFallback: 'index.html', trailingSlash: 'never' },
      manifest: {
        name: 'manual-editor（仮称）',
        short_name: 'manual-editor',
        description: '体験型の操作マニュアルを画面の上で作るツールの試作',
        lang: 'ja',
        start_url: `${base}/`,
        scope: `${base}/`,
        display: 'standalone',
        background_color: '#f6f7f9',
        theme_color: '#1f5fbf',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['client/**/*.{js,css,ico,png,svg,webp,json,webmanifest}'],
        // SPA の入口。adapter-static が build の最後に書く index.html は上の glob に入らないので、ここで足す。
        // 足さないと、オフラインで開いたときに service worker の navigation 応答が失敗する。
        additionalManifestEntries: [{ url: 'index.html', revision: String(Date.now()) }],
        // 例の画像（券売機の仮の画面）は大きいので、事前の保存の対象から外す。見たときにネットワークから取る。
        globIgnores: ['**/examples/img/**']
      },
      devOptions: { enabled: false }
    })
  ],
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node'
  }
});
