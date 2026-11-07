/**
 * player の画面の文言。日本語を先に書き、英語を同じキーで持つ。
 */
export type Lang = 'ja' | 'en';

const ja = {
  'nav.contents': '目次',
  'nav.scope': '適用範囲',
  'nav.scopeAny': '指定しない',
  'nav.glossary': '用語集',
  'nav.version': '版',
  'kind.screenFlow': '画面',
  'kind.procedure': '手順',
  'kind.description': '説明',
  'kind.troubleshooting': '困ったとき',
  'flow.back': '戻る',
  'flow.restart': '最初から',
  'flow.hints': 'ヒントを表示',
  'flow.pressable': '押せる場所',
  'flow.noTransition': 'この場所を押しても画面は変わりません。',
  'flow.read': '読むだけの場所です。',
  'flow.notFound': '遷移先の画面 {to} が見つかりません。',
  'flow.notApplicable': 'いまの適用範囲では、この操作はできません。',
  'flow.condition': '条件: {text}',
  'flow.end': 'この画面で終わりです。',
  'flow.step': '手順「{title}」へ',
  'flow.toScreen': '→ {caption}',
  'flow.input': '入力',
  'proc.list': '一覧',
  'proc.oneByOne': '1 つずつ',
  'proc.prev': '前へ',
  'proc.next': '次へ',
  'proc.end': '手順はここまでです。',
  'proc.choose': '次に進む先を選んでください。',
  'proc.goto': '手順 {number} へ',
  'proc.expected': '→ {text}',
  'proc.applies': '適用: {text}',
  'proc.openScreen': '画面を開く',
  'proc.closeScreen': '画面を閉じる',
  'fig.enlarge': '拡大',
  'fig.shrink': '縮小',
  'fig.other': '{kind} の素材: {name}',
  'ts.back': '1 つ前の問いへ',
  'ts.restart': '最初から',
  'ts.resolution': '対処',
  'ts.goTopic': '「{title}」を開く',
  'ts.notFound': '行き先 {to} が見つかりません。',
  'level.warning': '警告',
  'level.caution': '注意',
  'level.note': '備考',
  'topic.notYet': 'この種類（{kind}）の表示はまだありません。',
  'manual.loading': '読み込んでいます…',
  'manual.error': 'マニュアルを読み込めませんでした: {message}',
  'manual.noTopic': 'Topic {id} がありません。'
} as const;

export type Key = keyof typeof ja;

const en: Record<Key, string> = {
  'nav.contents': 'Contents',
  'nav.scope': 'Applies to',
  'nav.scopeAny': 'Any',
  'nav.glossary': 'Glossary',
  'nav.version': 'Version',
  'kind.screenFlow': 'Screens',
  'kind.procedure': 'Procedure',
  'kind.description': 'Description',
  'kind.troubleshooting': 'Troubleshooting',
  'flow.back': 'Back',
  'flow.restart': 'Restart',
  'flow.hints': 'Show hints',
  'flow.pressable': 'Where to press',
  'flow.noTransition': 'Pressing here does not change the screen.',
  'flow.read': 'This is for reading only.',
  'flow.notFound': 'Screen {to} was not found.',
  'flow.notApplicable': 'This action is not available in the selected scope.',
  'flow.condition': 'Condition: {text}',
  'flow.end': 'This is the last screen.',
  'flow.step': 'Go to procedure "{title}"',
  'flow.toScreen': '→ {caption}',
  'flow.input': 'input',
  'proc.list': 'List',
  'proc.oneByOne': 'One at a time',
  'proc.prev': 'Previous',
  'proc.next': 'Next',
  'proc.end': 'End of the procedure.',
  'proc.choose': 'Choose where to go next.',
  'proc.goto': 'Go to step {number}',
  'proc.expected': '→ {text}',
  'proc.applies': 'Applies to: {text}',
  'proc.openScreen': 'Open the screen',
  'proc.closeScreen': 'Close the screen',
  'fig.enlarge': 'Enlarge',
  'fig.shrink': 'Shrink',
  'fig.other': '{kind} asset: {name}',
  'ts.back': 'Previous question',
  'ts.restart': 'Restart',
  'ts.resolution': 'What to do',
  'ts.goTopic': 'Open "{title}"',
  'ts.notFound': 'Target {to} was not found.',
  'level.warning': 'Warning',
  'level.caution': 'Caution',
  'level.note': 'Note',
  'topic.notYet': 'Topics of kind {kind} are not displayed yet.',
  'manual.loading': 'Loading…',
  'manual.error': 'Could not load the manual: {message}',
  'manual.noTopic': 'Topic {id} does not exist.'
};

const dict: Record<Lang, Record<Key, string>> = { ja, en };

export function t(lang: Lang, key: Key, vars: Record<string, string | number> = {}): string {
  let s: string = dict[lang][key] ?? dict.ja[key];
  for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

export function toLang(value: string | null | undefined): Lang {
  return value?.toLowerCase().startsWith('en') ? 'en' : 'ja';
}
