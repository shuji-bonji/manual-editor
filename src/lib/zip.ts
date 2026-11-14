/**
 * zip の読み書き（1 冊を 1 つのファイルにまとめて保存する。設計書 13.4 節）。
 *
 * - 書くとき（zipStore）は圧縮しない（stored）。中身の大半は PNG / JPEG で、もう一度圧縮しても小さくならないため。
 * - 読むとき（unzip）は、stored と deflate の両方を読む。OS の機能で作り直した zip（Finder の「圧縮」など）も開けるようにするため。
 *   deflate の展開にはブラウザーの DecompressionStream('deflate-raw') を使う。
 * - 対応しないもの: ZIP64（4 GB 以上、65,535 件以上）、暗号化、分割。見つけたら理由を付けて投げる。
 * - ファイル名は UTF-8 として読み書きする。
 */

export interface ZipEntry {
  /** zip の中のパス（区切りは "/"） */
  path: string;
  data: Uint8Array;
}

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_END = 0x06054b50;

let crcTable: Uint32Array | undefined;

/** CRC-32（zip が使う多項式 0xEDB88320） */
export function crc32(data: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** 日時を MS-DOS の形式（zip のヘッダーが使う。2 秒刻み、1980 年から）にする */
function dosDateTime(d: Date): { time: number; date: number } {
  const year = Math.max(1980, d.getFullYear());
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  };
}

/** 圧縮しない zip を作る。同じ path が 2 回あれば投げる */
export function zipStore(entries: ZipEntry[], date: Date = new Date()): Uint8Array {
  if (entries.length >= 0xffff) throw new Error('ファイルの数が多すぎます（65,535 件以上は扱えません）');
  const enc = new TextEncoder();
  const { time, date: day } = dosDateTime(date);
  const seen = new Set<string>();
  const items = entries.map((e) => {
    if (seen.has(e.path)) throw new Error(`zip の中で path が重なっています: ${e.path}`);
    seen.add(e.path);
    return { name: enc.encode(e.path), data: e.data, crc: crc32(e.data) };
  });
  const bodySize = items.reduce((n, it) => n + 30 + it.name.length + it.data.length, 0);
  const centralSize = items.reduce((n, it) => n + 46 + it.name.length, 0);
  const total = bodySize + centralSize + 22;
  if (total >= 0xffffffff) throw new Error('zip が大きすぎます（4 GB 以上は扱えません）');

  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  const offsets: number[] = [];
  let p = 0;
  for (const it of items) {
    offsets.push(p);
    view.setUint32(p, SIG_LOCAL, true);
    view.setUint16(p + 4, 20, true); // 展開に要る版
    view.setUint16(p + 6, 0x0800, true); // ファイル名は UTF-8
    view.setUint16(p + 8, 0, true); // stored
    view.setUint16(p + 10, time, true);
    view.setUint16(p + 12, day, true);
    view.setUint32(p + 14, it.crc, true);
    view.setUint32(p + 18, it.data.length, true);
    view.setUint32(p + 22, it.data.length, true);
    view.setUint16(p + 26, it.name.length, true);
    view.setUint16(p + 28, 0, true);
    out.set(it.name, p + 30);
    out.set(it.data, p + 30 + it.name.length);
    p += 30 + it.name.length + it.data.length;
  }
  const centralStart = p;
  items.forEach((it, i) => {
    view.setUint32(p, SIG_CENTRAL, true);
    view.setUint16(p + 4, 20, true); // 作った側の版
    view.setUint16(p + 6, 20, true);
    view.setUint16(p + 8, 0x0800, true);
    view.setUint16(p + 10, 0, true);
    view.setUint16(p + 12, time, true);
    view.setUint16(p + 14, day, true);
    view.setUint32(p + 16, it.crc, true);
    view.setUint32(p + 20, it.data.length, true);
    view.setUint32(p + 24, it.data.length, true);
    view.setUint16(p + 28, it.name.length, true);
    // extra・コメント・ディスク番号・属性は 0 のまま
    view.setUint32(p + 42, offsets[i], true);
    out.set(it.name, p + 46);
    p += 46 + it.name.length;
  });
  view.setUint32(p, SIG_END, true);
  view.setUint16(p + 8, items.length, true);
  view.setUint16(p + 10, items.length, true);
  view.setUint32(p + 12, centralSize, true);
  view.setUint32(p + 16, centralStart, true);
  return out;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') throw new Error('このブラウザーでは、圧縮された zip を展開できません');
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** zip を読む。フォルダーだけの項目は返さない */
export async function unzip(bytes: Uint8Array): Promise<ZipEntry[]> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // 末尾の「中央ディレクトリーの終わり」を探す（後ろにコメントが付くことがあるので、後ろから探す）
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === SIG_END) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error('zip として読めません（終端の記録がありません）');
  const count = view.getUint16(end + 10, true);
  const centralStart = view.getUint32(end + 16, true);
  if (count === 0xffff || centralStart === 0xffffffff) throw new Error('ZIP64 の zip は扱えません');

  const dec = new TextDecoder('utf-8');
  const out: ZipEntry[] = [];
  let p = centralStart;
  for (let i = 0; i < count; i++) {
    if (p + 46 > bytes.length || view.getUint32(p, true) !== SIG_CENTRAL) throw new Error('zip として読めません（中央ディレクトリーが壊れています）');
    const flags = view.getUint16(p + 8, true);
    const method = view.getUint16(p + 10, true);
    const crc = view.getUint32(p + 16, true);
    const compSize = view.getUint32(p + 20, true);
    const size = view.getUint32(p + 24, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const local = view.getUint32(p + 42, true);
    const path = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (path.endsWith('/')) continue;
    if (flags & 1) throw new Error(`暗号化された zip は扱えません: ${path}`);
    if (compSize === 0xffffffff || size === 0xffffffff || local === 0xffffffff) throw new Error('ZIP64 の zip は扱えません');
    if (local + 30 > bytes.length || view.getUint32(local, true) !== SIG_LOCAL) throw new Error(`zip として読めません（${path} の位置が壊れています）`);
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    if (start + compSize > bytes.length) throw new Error(`zip として読めません（${path} が途中で切れています）`);
    const raw = bytes.subarray(start, start + compSize);
    let data: Uint8Array;
    if (method === 0) data = raw.slice();
    else if (method === 8) data = await inflateRaw(raw);
    else throw new Error(`この圧縮方式（${method}）は扱えません: ${path}`);
    if (data.length !== size || crc32(data) !== crc) throw new Error(`zip の中身が壊れています: ${path}`);
    out.push({ path, data });
  }
  return out;
}

/** 先頭の 4 バイトが zip のものか */
export const looksLikeZip = (bytes: Uint8Array): boolean =>
  bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 0x03 || bytes[2] === 0x05) && (bytes[3] === 0x04 || bytes[3] === 0x06);
