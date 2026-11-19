// `npm run android:apk`: builds the signed app file (android/app/build/outputs/apk/release/app-release.apk)
// with Java 21, without touching version numbers or the download page. For a real release use android:release.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { findJava21 } from './java21.mjs';

const root = join(import.meta.dirname, '..');
const javaHome = findJava21();
if (!javaHome) {
  console.error('\n✖ Java 21 was not found. In Android Studio, download it once: see "If the build fails" in docs/android-release.md.\n');
  process.exit(1);
}

const run = (cmd, cwd, env = process.env) => {
  console.log(`\n> ${cmd}`);
  const r = spawnSync(cmd, { cwd, env, stdio: 'inherit', shell: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

console.log(`Building with Java 21 from ${javaHome}`);
run('npm run android:sync', root);
run(`"${join(root, 'android', 'gradlew.bat')}" assembleRelease`, join(root, 'android'), { ...process.env, JAVA_HOME: javaHome });
console.log('\nDone: android/app/build/outputs/apk/release/app-release.apk');
