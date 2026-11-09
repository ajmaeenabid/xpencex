// Where the phone app is downloaded from, and the file that says which version is the newest.
// Both live on the Cloudflare download site (public/download/, see download-site/wrangler.jsonc).

export const SITE_URL = 'https://xpencex.xpence.workers.dev';
export const APK_PATH = '/download/xpencex.apk';
export const VERSION_PATH = '/download/version.json';

/** public/download/version.json: update it with every new app file */
export interface ReleaseInfo {
  versionCode: number; // must match versionCode in android/app/build.gradle
  versionName: string; // shown to people, e.g. "1.0.0"
  sizeMb?: number;
  notes?: { en?: string; bn?: string };
}

/** True when the website has a newer app than the one installed */
export const isNewer = (latest: Pick<ReleaseInfo, 'versionCode'> | null, installedCode: number) =>
  !!latest && Number.isFinite(latest.versionCode) && latest.versionCode > installedCode;
