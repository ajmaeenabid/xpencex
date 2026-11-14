// `npm run test:rules`: checks firestore.rules with tests/rules/*.test.ts against the Firebase Emulator,
// a fake Firestore that runs on this computer. The emulator needs Java 21, found the same way as in
// android-release.mjs (on GitHub CI, JAVA_HOME already points to Java 21).
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';

const isJava21 = (home) => {
  try {
    return /JAVA_VERSION="2[1-9][".]/.test(readFileSync(join(home, 'release'), 'utf8'));
  } catch {
    return false;
  }
};
const candidates = [process.env.JAVA_HOME?.replace(/[\\/]+$/, '')];
for (const dir of [join(homedir(), '.jdks'), 'C:\\Program Files\\Eclipse Adoptium', 'C:\\Program Files\\Java', '/usr/lib/jvm']) {
  if (existsSync(dir)) for (const d of readdirSync(dir)) candidates.push(join(dir, d));
}
candidates.push('C:\\Program Files\\Android\\Android Studio\\jbr');
const javaHome = candidates.find((c) => c && isJava21(c));
if (!javaHome) {
  console.error('\n✖ Java 21 or newer was not found. The Firebase Emulator needs it. See "If the build fails" in docs/android-release.md.\n');
  process.exit(1);
}

const env = { ...process.env, JAVA_HOME: javaHome, PATH: `${join(javaHome, 'bin')}${delimiter}${process.env.PATH}` };
const firebase = spawnSync('firebase --version', { shell: true }).status === 0 ? 'firebase' : 'npx --yes firebase-tools@15.35.0';
const cmd = `${firebase} emulators:exec --only firestore --project demo-xpences "npx vitest run --config vitest.rules.config.ts"`;
console.log(`\n> ${cmd}  (Java: ${javaHome})`);
const r = spawnSync(cmd, { env, stdio: 'inherit', shell: true });
process.exit(r.status ?? 1);
