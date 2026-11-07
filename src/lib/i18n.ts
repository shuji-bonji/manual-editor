/**
 * 画面の文言を 1 か所にまとめる。
 *
 * - 試作では日本語（ja）だけを持つ。英語を足すときは、Locale に 'en' を足し、messages に同じキーを持つ en を作る。
 *   キーの抜けは型検査（svelte-check）で見つかる。
 * - 文言の中の `{name}` は、t(key, { name: 値 }) の値に置き換わる。
 * - ここにある文言は画面の表示用で、manual-model の JSON には入らない。
 */

const ja = {
  // アプリ
  'app.name': 'manual-editor（仮称）',
  'app.title': 'manual-editor（仮称）',
  'app.prototype': '試作',
  'manual.untitled': '無題のマニュアル',
  'tabs.label': '作業の切り替え',
  'tab.edit': '編集',
  'tab.library': '適用範囲・素材',
  'tab.check': '検査',
  'tab.play': '体験表示',
  'edit.noTopic': '左の「Topic を追加」から話題を作るか、ファイルを開いてください。',

  // 共通
  'common.up': '上へ',
  'common.down': '下へ',
  'common.remove': '削除',
  'common.close': '閉じる',

  // ファイル
  'file.toolbar': 'ファイル操作',
  'file.new': '新規',
  'file.open': '開く',
  'file.openPicker': '開く（上書き保存できる）',
  'file.example': '券売機の例を開く',
  'file.save': '保存',
  'file.saveAs': '名前を付けて保存',
  'file.download': 'ダウンロード',
  'file.undo': '元に戻す',
  'file.redo': 'やり直し',
  'file.embed': '画像を JSON に埋め込む',
  'file.embedHelp':
    '画像を data URL にして、素材の source.path に入れます（試作の選択肢）。入れないときは、画像は JSON と別のファイルで持ちます。',
  'file.confirmDiscard': '保存していない変更があります。破棄して続けますか。',
  'open.legacy': '2021 年の JSON を manual-model の形に変換して開きました。保存すると manual-model の JSON になります。',
  'open.missingImages':
    '画像が見つからない素材が {n} 件あります。「適用範囲・素材」タブの「画像をまとめて割り当てる」で、画像ファイルを選んでください。',
  'open.exampleNote': '券売機の例を開きました。画像は試作用の仮のものです。',
  'open.exampleFailed': '例を開けませんでした: {reason}',
  'save.doneSeparate': '保存しました。画像は JSON に入っていません。画像ファイルは別に保存して、同じ名前で置いてください。',
  'save.doneEmbedded': '保存しました。画像は data URL として JSON に埋め込まれています。',
  'save.doneFile': '{name} に保存しました。',
  'save.embedFailed': '素材 {id} の画像を埋め込めませんでした。',
  'draft.found': '前回の編集の下書きがあります（{time}）。画像は下書きに含まれません。',
  'draft.restore': '復元する',
  'draft.discard': '破棄する',
  'draft.restoredNote': '下書きを復元しました。画像は読み込み直してください。',

  // Topic
  'topic.heading': 'Topic 一覧',
  'topic.empty': 'Topic がありません。',
  'topic.add': 'Topic を追加',
  'topic.newKind': '追加する Topic の種類',
  'topic.newTitle': '新しい Topic {n}',
  'topic.select': '{title} を選ぶ',
  'topic.title': '題名',
  'topic.kind': '種類',
  'topic.summary': '概要',
  'topic.confirmRemove': 'Topic「{title}」を削除します。この Topic の画面や手順も消えます。よろしいですか。',
  'kind.description': '説明',
  'kind.procedure': '手順',
  'kind.screenFlow': '画面の流れ',
  'kind.troubleshooting': '困ったとき',
  'description.notSupported':
    '説明（description）の本文 Block の編集は試作では見送りました。読み込んだ Block（{n} 件）はそのまま保存されます。',

  // 画面エディター
  'screen.heading': '画面',
  'screen.add': '画面を追加（画像を選ぶ）',
  'screen.addHelp': '画面のスクリーンショットを選ぶと、素材と画面が作られます。複数選べます。',
  'screen.editorLabel': '画面エディター',
  'screen.noneSelected': '画面がありません。左の「画面を追加」で画像を選んでください。',
  'screen.start': '開始',
  'screen.hotspotCount': '{n} か所',
  'screen.size': '画像 {w}×{h} 画素',
  'screen.sizeUnknown': '画像の大きさ: 不明',
  'screen.imageMissing': '画像「{path}」が読み込まれていません。同じ画像ファイルを選んでください。',
  'screen.assignImage': '画像を選ぶ',
  'screen.replaceImage': '画像を差し替える',
  'screen.saveImage': '画像を保存',
  'screen.imageNote': '保存される path: {path}',
  'screen.embedded': '（JSON に埋め込み）',
  'screen.props': '画面の情報',
  'screen.caption': '短い名前（STEP1 など）',
  'screen.description': '説明',
  'screen.setStart': '開始画面にする',
  'screen.remove': 'この画面を削除',
  'screen.confirmRemove': '画面「{name}」を削除します。この画面へ遷移するホットスポットは、検査で参照切れになります。よろしいですか。',
  'screen.defaultCaption': 'STEP{n}',
  'canvas.label': '画面の画像とホットスポット',
  'canvas.noImage': '画像がありません',
  'tool.label': '作図の道具',
  'tool.select': '選ぶ',
  'tool.rect': '矩形',
  'tool.circle': '円',
  'tool.helpSelect': 'ホットスポットを押して選びます。',
  'tool.helpDraw': '画像の上でドラッグして描きます。円は、押した点が中心で、離した点までが半径です。',

  // ホットスポット
  'hotspot.heading': 'ホットスポット',
  'hotspot.empty': 'まだありません。画像の上でドラッグして描いてください。',
  'hotspot.defaultLabel': '操作{n}',
  'hotspot.label': 'ラベル',
  'hotspot.action': '操作の種類',
  'hotspot.actionNone': '（指定しない）',
  'hotspot.transition': '遷移先の画面',
  'hotspot.transitionNone': '（遷移しない）',
  'hotspot.transitionBroken': '（参照切れ）{to}',
  'hotspot.condition': '遷移の条件（文）',
  'hotspot.coords': '座標（{shape}、元の画像の画素）',
  'hotspot.coordsHelp.rect': '[x1, y1, x2, y2]',
  'hotspot.coordsHelp.circle': '[中心 x, 中心 y, 半径]',
  'hotspot.coordsHelp.poly': '[x1, y1, x2, y2, …]（試作では数値で直します）',
  'hotspot.remove': 'このホットスポットを削除',
  'shape.rect': '矩形',
  'shape.circle': '円',
  'shape.poly': '多角形',
  'action.press': '押す',
  'action.input': '入力',
  'action.read': '読む',

  // 手順
  'step.empty': '手順がありません。',
  'step.add': '手順を追加',
  'step.addChild': '子の手順を追加',
  'step.indent': '一段深く',
  'step.outdent': '一段浅く',
  'step.text': '手順の文',
  'step.expected': '期待される結果',
  'step.question': '問い（困ったとき）',
  'step.target': '操作対象（ホットスポット）',
  'step.targetNone': '（指定しない）',
  'step.targetBroken': '（見つかりません）{id}',
  'admonition.heading': '注意書き',
  'admonition.add': '注意書きを追加',
  'admonition.level': '注意の種類',
  'admonition.text': '注意の文',
  'level.warning': '警告',
  'level.caution': '注意',
  'level.note': '備考',

  // 適用範囲・素材
  'library.meta': 'マニュアルの情報',
  'manual.title': '題名',
  'manual.language': '言語（BCP 47）',
  'manual.version': '版',
  'manual.versionDate': '版の日付',
  'manual.description': '説明',
  'library.scopes': '適用範囲（Scope）',
  'library.scopesHelp': 'この機種・この設置場所だけに当てはまる内容を示します。Topic・手順・画面に付けると、その範囲の内容になります。',
  'scope.add': '適用範囲を追加',
  'scope.newName': '適用範囲 {n}',
  'scope.displayText': '表示する文',
  'scope.property': '属性名（例: model）',
  'scope.values': '値（コンマ区切り）',
  'scope.refs': '適用範囲',
  'scope.noneDefined': '適用範囲がありません。「適用範囲・素材」タブで作れます。',
  'scope.confirmRemove': '適用範囲「{name}」を削除します。付けていた箇所からも外れます。よろしいですか。',
  'library.assets': '素材（画像）',
  'library.assetsHelp':
    '画像は JSON と別のファイルで持ちます。JSON には Asset.source.path にファイル名だけが入ります。開いたあとで画像が見つからないときは、ここで割り当ててください。',
  'library.assignBulk': '画像をまとめて割り当てる',
  'library.assignOne': '画像を割り当てる',
  'library.pruneAssets': '使われていない素材を整理',
  'library.noAssets': '素材がありません。',
  'library.noImage': '画像なし',
  'library.unused': '未使用',
  'library.alt': '代替テキスト',
  'image.unreadable': '画像として読めませんでした。',
  'image.notImage': '{name} は画像ではないので追加しませんでした。',
  'image.assigned': '画像を {n} 件割り当てました。',
  'image.assignPartial': '{total} 件のうち {n} 件を割り当てました。ファイル名が素材の path と合わないものは割り当てていません。',

  // 検査
  'check.heading': '検査の結果',
  'check.help': '項目を押すと、該当の Topic・画面・手順へ移ります。検査は manual-model の validateManual です。',
  'check.allClear': '問題はありません',
  'check.error': 'エラー',
  'check.warning': '警告',
  'check.errorCount': 'エラー {n}',
  'check.warningCount': '警告 {n}',
  'check.dropBroken': '参照が切れた遷移をすべて外す',
  'check.dropped': '参照が切れた遷移を {n} 件外しました。',

  // 体験表示
  'play.noFlow': '画面を持つ「画面の流れ」の Topic がありません。',
  'play.topic': '始める Topic',
  'play.back': '戻る',
  'play.restart': '最初から',
  'play.hints': 'ホットスポットの場所を見せる',
  'play.position': '{n} 画面目',
  'play.noTransition': '「{label}」には遷移先が付いていません。',
  'play.notScreen': '遷移先「{to}」は画面ではないため、進めません。',
  'play.condition': '条件: {text}',
  'play.end': 'この画面にはホットスポットがありません（流れの終わりです）。'
} as const;

export type Locale = 'ja';
export type MessageKey = keyof typeof ja;

const messages: Record<Locale, Record<MessageKey, string>> = { ja };

let locale: Locale = 'ja';

export function setLocale(next: Locale): void {
  locale = next;
}

export function t(key: MessageKey, params?: Record<string, string | number>): string {
  const template = messages[locale][key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole));
}
