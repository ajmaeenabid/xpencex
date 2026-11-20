// One-step Android release: `npm run android:release`
// 1. checks the version numbers in android/app/build.gradle, public/download/version.json and package.json match
// 2. builds the app and the signed app file (with Java 21, which Capacitor needs)
// 3. copies it to public/download/xpencex.apk and writes its size and fingerprints into version.json
// Then publish the download page with `npm run release:site`.
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { findJava21 } from './java21.mjs';
import { apkFingerprints } from './apk-fingerprints.mjs';

const root = join(import.meta.dirname, '..');
const gradleFile = join(root, 'android', 'app', 'build.gradle');
const versionFile = join(root, 'public', 'download', 'version.json');
const builtApk = join(root, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
const publicApk = join(root, 'public', 'download', 'xpencex.apk');

const stop = (msg) => {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
};

// 1. Version numbers
const gradle = readFileSync(gradleFile, 'utf8');
const code = Number(gradle.match(/versionCode\s+(\d+)/)?.[1]);
const name = gradle.match(/versionName\s+"([^"]+)"/)?.[1];
const info = JSON.parse(readFileSync(versionFile, 'utf8'));
if (info.versionCode !== code || info.versionName !== name) {
  stop(
    `The version numbers don't match.\n` +
      `  android/app/build.gradle:     versionCode ${code}, versionName "${name}"\n` +
      `  public/download/version.json: versionCode ${info.versionCode}, versionName "${info.versionName}"\n` +
      `Put the same two values in both files, then run this again.`,
  );
}
// package.json carries the same version name, so it never drifts from the app's
const pkgVersion = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
if (pkgVersion !== name) {
  stop(
    `package.json says version "${pkgVersion}", but the app is "${name}".\n` +
      `Set "version": "${name}" in package.json, then run this again.`,
  );
}
if (!existsSync(join(root, 'android', 'keystore.properties'))) {
  stop('android/keystore.properties is missing, so the app file could not be signed. See docs/android-release.md, Job 2.');
}

// 2. Find Java 21
const javaHome = findJava21();
if (!javaHome) {
  stop('Java 21 was not found. In Android Studio, download it once: see "If the build fails" in docs/android-release.md.');
}

const run = (cmd, cwd, env = process.env) => {
  console.log(`\n> ${cmd}`);
  const r = spawnSync(cmd, { cwd, env, stdio: 'inherit', shell: true });
  if (r.status !== 0) stop(`This step failed: ${cmd}\nRead the red message above, or ask for help with a screenshot of it.`);
};

console.log(`Building Xpences ${name} (versionCode ${code}) with Java 21 from ${javaHome}`);
run('npm run android:sync', root);
run(`"${join(root, 'android', 'gradlew.bat')}" assembleRelease`, join(root, 'android'), { ...process.env, JAVA_HOME: javaHome });

// 3. Copy the app file and record its size
if (!existsSync(builtApk)) stop(`The app file was not made: ${builtApk}`);
copyFileSync(builtApk, publicApk);
const sizeMb = Math.max(1, Math.round(statSync(publicApk).size / 1024 / 1024));
info.sizeMb = sizeMb;
// The codes the download page shows so people can check the file is genuine (scripts/apk-fingerprints.mjs)
Object.assign(info, apkFingerprints(publicApk));
writeFileSync(versionFile, JSON.stringify(info, null, 2) + '\n');

console.log(
  `\n✔ Done. public/download/xpencex.apk is version ${name} (${sizeMb} MB), and version.json is updated.\n` +
    `  Test it on your phone, then publish the download page with: npm run release:site\n`,
);
