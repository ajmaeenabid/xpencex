import { Capacitor } from '@capacitor/core';

// What the installed phone app does differently from a browser. Kept here so screens stay the same:
// - links to other sites open in the phone's browser (the app itself can't open new tabs)
// - "downloads" become a file shared through Android's Share menu (save to Files, Drive, WhatsApp...)

export const isNative = () => Capacitor.isNativePlatform();

/** The installed app's version name, like "1.0.3" (from android/app/build.gradle). Empty outside the phone app. */
export async function appVersion(): Promise<string> {
  if (!isNative()) return '';
  const { App } = await import('@capacitor/app');
  return (await App.getInfo()).version;
}

export async function openExternal(url: string) {
  const { Browser } = await import('@capacitor/browser');
  await Browser.open({ url });
}

/**
 * Opens the link in the phone's own browser app (Chrome), not the window inside Xpences.
 * Used for the app file: the inside window can hang on "Downloading..." and hide the finished file,
 * while Chrome saves it to Downloads and shows a notification to tap and install.
 */
export async function openInBrowser(url: string) {
  const { AppLauncher } = await import('@capacitor/app-launcher');
  const { completed } = await AppLauncher.openUrl({ url });
  if (!completed) await openExternal(url); // no browser app found: fall back to the inside window
}

/** Writes the file to the app's cache and opens Android's Share menu for it */
export async function shareFile(filename: string, content: string, title: string) {
  const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
  const { uri } = await Filesystem.writeFile({ path: filename, data: content, directory: Directory.Cache, encoding: Encoding.UTF8 });
  await Share.share({ title, files: [uri] });
}

/** Like shareFile, for a file that isn't text (a receipt PDF). `base64` is the file's bytes. */
export async function shareBinaryFile(filename: string, base64: string, title: string) {
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
  const { uri } = await Filesystem.writeFile({ path: filename, data: base64, directory: Directory.Cache });
  await Share.share({ title, files: [uri] });
}

/**
 * In the phone app, a tap on a link to another site (Google Sheets, Calendar, the privacy policy,
 * an update) opens it in the phone's browser. Installed once, for the whole app.
 */
export function openOutsideLinksInBrowser() {
  if (!isNative()) return;
  document.addEventListener('click', (e) => {
    const link = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
    if (!link || !/^https?:/i.test(link.href)) return;
    if (new URL(link.href).origin === window.location.origin && link.target !== '_blank') return;
    e.preventDefault();
    openExternal(link.href).catch(err => console.error('Could not open the link:', err));
  }, true);
}
