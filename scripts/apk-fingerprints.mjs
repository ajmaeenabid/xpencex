// The two codes the download page shows so careful people can check their app file is genuine:
//   certSha256  the signing key's fingerprint, read from the app file itself (never changes between versions)
//   apkSha256   this version's file fingerprint (changes with every version)
// npm run android:release fills them in. Run on its own to fill them in for the app file already in
// public/download: node scripts/apk-fingerprints.mjs
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findJava21 } from './java21.mjs';

const root = join(import.meta.dirname, '..');

/** "4f26ad..." -> "4F:26:AD:...", the usual way to write a key fingerprint */
const withColons = (hex) => hex.toUpperCase().match(/../g).join(':');

/** apksigner from the newest Android build tools (the SDK folder is in android/local.properties) */
function findApksigner() {
  const props = readFileSync(join(root, 'android', 'local.properties'), 'utf8');
  const sdk = props.match(/^sdk\.dir=(.*)$/m)?.[1]?.replace(/\\:/g, ':').replace(/\\\\/g, '\\').trim();
  const tools = sdk && join(sdk, 'build-tools');
  if (!tools || !existsSync(tools)) return null;
  const newest = readdirSync(tools).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).pop();
  const tool = newest && join(tools, newest, process.platform === 'win32' ? 'apksigner.bat' : 'apksigner');
  return tool && existsSync(tool) ? tool : null;
}

export function apkFingerprints(apkPath) {
  const apkSha256 = withColons(createHash('sha256').update(readFileSync(apkPath)).digest('hex'));

  const apksigner = findApksigner();
  const javaHome = findJava21();
  if (!apksigner || !javaHome) throw new Error('apksigner (Android build tools) or Java 21 was not found.');
  const r = spawnSync(`"${apksigner}" verify --print-certs "${apkPath}"`, {
    shell: true,
    encoding: 'utf8',
    env: { ...process.env, JAVA_HOME: javaHome },
  });
  const certs = [...(r.stdout || '').matchAll(/certificate SHA-256 digest: ([0-9a-f]{64})/g)].map((m) => m[1]);
  // Exactly one signer is expected; anything else means the file isn't the one we signed
  if (r.status !== 0 || certs.length !== 1) throw new Error(`Could not read the app file's signing key:\n${r.stdout}${r.stderr}`);
  return { apkSha256, certSha256: withColons(certs[0]) };
}

/** Writes both codes into version.json */
export function saveFingerprints(apkPath, versionFile) {
  const info = JSON.parse(readFileSync(versionFile, 'utf8'));
  Object.assign(info, apkFingerprints(apkPath));
  writeFileSync(versionFile, JSON.stringify(info, null, 2) + '\n');
  return info;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const info = saveFingerprints(join(root, 'public', 'download', 'xpencex.apk'), join(root, 'public', 'download', 'version.json'));
  console.log(`Signing key: ${info.certSha256}\nApp file:    ${info.apkSha256}`);
}
