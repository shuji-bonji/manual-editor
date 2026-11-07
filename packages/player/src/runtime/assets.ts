/**
 * 素材（Manual.assets）の URL と大きさ。
 * data URL（source.data。0.1.0 では path に入っていた）はそのまま、ファイル名（source.path）は baseUrl からの相対で解決する。
 */
import type { Asset, AssetFile, Manual } from '@shuji-bonji/experiential-manual-model';

export function findAsset(manual: Manual, assetRef: string): Asset | undefined {
  return manual.assets?.find((a) => a.id === assetRef);
}

/** 表示に使うファイル（display があればそれ、無ければ source） */
export function displayFile(asset: Asset): AssetFile {
  return asset.display ?? asset.source;
}

/** 素材の URL。baseUrl は Manual の JSON の URL（画像はそこからの相対パス） */
export function assetUrl(manual: Manual, assetRef: string, baseUrl?: string | URL): string | undefined {
  const asset = findAsset(manual, assetRef);
  if (!asset) return undefined;
  return fileUrl(displayFile(asset), baseUrl);
}

export function fileUrl(file: AssetFile, baseUrl?: string | URL): string | undefined {
  if (file.data) return file.data;
  const path = file.path;
  if (path === undefined) return undefined;
  if (path.startsWith('data:')) return path;
  if (!baseUrl) return path;
  try {
    return new URL(path, baseUrl).href;
  } catch {
    return path;
  }
}

/** 素材に書かれた元の大きさ（model 0.2.0 の width / height）。無ければ undefined */
export function assetSize(manual: Manual, assetRef: string): { width: number; height: number } | undefined {
  const asset = findAsset(manual, assetRef);
  if (!asset) return undefined;
  const f = displayFile(asset);
  return f.width !== undefined && f.height !== undefined ? { width: f.width, height: f.height } : undefined;
}
