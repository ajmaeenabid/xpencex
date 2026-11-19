// Finds Java 21 (Capacitor's Android build needs it): JAVA_HOME if it is 21, then ~/.jdks (where Android Studio
// downloads JDKs), Eclipse Adoptium, Oracle Java, and Android Studio's own copy. Returns undefined if none is 21.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const isJava21 = (home) => {
  try {
    return /JAVA_VERSION="21[".]/.test(readFileSync(join(home, 'release'), 'utf8'));
  } catch {
    return false;
  }
};

export function findJava21() {
  const candidates = [process.env.JAVA_HOME?.replace(/[\\/]+$/, '')];
  for (const dir of [join(homedir(), '.jdks'), 'C:\\Program Files\\Eclipse Adoptium', 'C:\\Program Files\\Java']) {
    if (existsSync(dir)) for (const d of readdirSync(dir)) candidates.push(join(dir, d));
  }
  candidates.push('C:\\Program Files\\Android\\Android Studio\\jbr');
  return candidates.find((c) => c && isJava21(c));
}
