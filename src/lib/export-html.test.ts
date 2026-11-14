import { describe, expect, it } from 'vitest';
import type { Manual } from '@shuji-bonji/experiential-manual-model';
import { buildExportHtml, escapeInlineJson, escapeInlineScript, suggestedHtmlName } from './export-html';

const manual = (over: Partial<Manual> = {}): Manual => ({ id: 'm', title: '券売機 <使い方> & "注意"', version: { number: '1.0' }, language: 'ja', topics: [], ...over }) as Manual;

/** 出来た HTML から、埋め込んだ JSON を取り出して読む（ブラウザーが行うのと同じ手順） */
function embeddedManual(html: string): Manual {
  const m = /<script type="application\/json" id="experiential-manual-data">([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw new Error('埋め込んだ JSON がありません');
  return JSON.parse(m[1]) as Manual;
}

describe('buildExportHtml', () => {
  it('題名と言語を HTML に書き、Manual を読み戻せる形で埋め込む', () => {
    const html = buildExportHtml({ manual: manual(), playerScript: 'var ExperientialManual=1;' });
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<html lang="ja">');
    expect(html).toContain('<title>券売機 &lt;使い方&gt; &amp; &quot;注意&quot;</title>');
    expect(html).toContain('<script>var ExperientialManual=1;</script>');
    expect(embeddedManual(html)).toEqual(manual());
  });

  it('player のビルドの末尾にある sourceMappingURL は外す（HTML の隣に .map は無い）', () => {
    const html = buildExportHtml({ manual: manual(), playerScript: 'var a=1;\n//# sourceMappingURL=experiential-manual.iife.js.map\n' });
    expect(html).not.toContain('sourceMappingURL');
    expect(html).toContain('<script>var a=1;\n</script>');
  });

  it('中身に </script> や <!-- があっても、HTML が途中で切れない', () => {
    const tricky = manual({ title: 't', description: 'a</script><script>alert(1)</script> <!-- b' });
    const html = buildExportHtml({ manual: tricky, playerScript: 'var a="</script>";var b="<!--";var c="</SCRIPT>";' });
    expect(embeddedManual(html)).toEqual(tricky);
    // script の終わりは、JSON の後・player の後・初期化の後の 3 つだけ
    expect(html.match(/<\/script>/gi)).toHaveLength(3);
    expect(html).not.toContain('<!--');
    expect(html).toContain('var a="<\\/script>";var b="<\\!--";var c="<\\/SCRIPT>";');
  });

  it('言語が英語なら player の文言も英語にし、言語の値が変なら ja にする', () => {
    expect(buildExportHtml({ manual: manual({ language: 'en-US' }), playerScript: '' })).toContain('<html lang="en-US">');
    expect(buildExportHtml({ manual: manual({ language: 'en-US' }), playerScript: '' })).toContain('<experiential-manual lang="en">');
    expect(buildExportHtml({ manual: manual({ language: '"><script>' }), playerScript: '' })).toContain('<html lang="ja">');
  });
});

describe('escape', () => {
  it('escapeInlineScript は、JavaScript として同じ意味のまま並びだけを変える', () => {
    const js = 'var s = "</script><!--";';
    const escaped = escapeInlineScript(js);
    expect(escaped).not.toMatch(/<\/script|<!--/i);
    expect(new Function(`${escaped} return s;`)()).toBe('</script><!--');
  });

  it('escapeInlineJson は、読み戻すと同じ値になる', () => {
    const value = { a: '</script>', b: '<b>', c: 'x\u2028y' };
    const text = escapeInlineJson(JSON.stringify(value));
    expect(text).not.toContain('<');
    expect(JSON.parse(text)).toEqual(value);
  });
});

describe('suggestedHtmlName', () => {
  it('題名から .html の名前を作る', () => {
    expect(suggestedHtmlName('券売機の使い方')).toBe('券売機の使い方.html');
    expect(suggestedHtmlName('a/b: c?')).toBe('a-b- c-.html');
    expect(suggestedHtmlName('')).toBe('manual.html');
  });
});
