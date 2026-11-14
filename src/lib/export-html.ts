/**
 * 単一の HTML のエクスポート（設計書 13.11 節）。
 * 閲覧部品（player の、モジュールでない形のビルド）とマニュアルの中身を 1 つの HTML に埋め込む。
 * 画像は data URL にして manual の JSON に入れてあるものを受け取る。出来た HTML は、ダブルクリック（file://）で開いて見られる。
 * 簡易の配布のためのもので、editor で開き直すことはできない（編集には .emanual を渡す）。
 */
import type { Manual } from '@shuji-bonji/experiential-manual-model';

const escapeHtml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * <script> の中に置く JavaScript から、HTML のパーサーが script の終わりやコメントの始まりと読む並びを消す。
 * "</script" と "<!--" は、JavaScript の文字列・正規表現・テンプレートの中では "<\/script"・"<\!--" と同じ意味になる。
 */
export const escapeInlineScript = (js: string): string => js.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');

/** <script type="application/json"> の中に置く JSON。"<" を \u003c にしておけば、中身に "</script>" があっても途中で切れない */
export const escapeInlineJson = (json: string): string => json.replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

export interface ExportHtmlInput {
  /** 画像を source.data（data URL）に埋め込んだ Manual */
  manual: Manual;
  /** player の、モジュールでない形のビルド（experiential-manual.iife.js）の中身 */
  playerScript: string;
  /** <meta name="generator"> に書く名前 */
  generator?: string;
}

export function buildExportHtml({ manual, playerScript, generator = 'Experiential Manual Editor' }: ExportHtmlInput): string {
  const lang = /^[A-Za-z]{2,3}(-[A-Za-z0-9]+)*$/.test(manual.language ?? '') ? manual.language : 'ja';
  const elementLang = lang.toLowerCase().startsWith('en') ? 'en' : 'ja';
  return `<!doctype html>
<html lang="${escapeHtml(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="${escapeHtml(generator)}">
<title>${escapeHtml(manual.title)}</title>
<style>
  html, body { margin: 0; min-height: 100%; background: #f6f7f9; }
  experiential-manual { display: block; min-height: 100vh; }
  @media (prefers-color-scheme: dark) { html, body { background: #15181d; } }
</style>
</head>
<body>
<experiential-manual lang="${elementLang}"></experiential-manual>
<noscript>このマニュアルを見るには、JavaScript を有効にしてください。</noscript>
<script type="application/json" id="experiential-manual-data">${escapeInlineJson(JSON.stringify(manual))}</script>
<script>${escapeInlineScript(playerScript.replace(/\n\/\/# sourceMappingURL=\S*\s*$/, '\n'))}</script>
<script>
  document.querySelector('experiential-manual').manual = JSON.parse(document.getElementById('experiential-manual-data').textContent);
</script>
</body>
</html>
`;
}

/** 題名から、エクスポートする HTML のファイル名の案を作る（ファイル名に使えない文字は "-" にする） */
export function suggestedHtmlName(title: string): string {
  const stem = title
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .slice(0, 80);
  return (stem || 'manual') + '.html';
}
