import { isNative } from './nativeApp';
import { setCrashlyticsRecorder } from './errorReports';

// Firebase Crashlytics in the phone app: it catches Android crashes by itself, and gets the same app errors as
// our own error reports (errorReports.ts). Nothing about the person is attached (no user id, no username).
// It only works when android/app/google-services.json was in place for the build; otherwise calls fail quietly.

export async function startCrashlytics() {
  if (!isNative()) return;
  try {
    const { FirebaseCrashlytics } = await import('@capacitor-firebase/crashlytics');
    await FirebaseCrashlytics.setEnabled({ enabled: true });
    setCrashlyticsRecorder((message, screen) => {
      FirebaseCrashlytics.setCustomKey({ key: 'screen', value: screen, type: 'string' })
        .then(() => FirebaseCrashlytics.recordException({ message }))
        .catch(() => { /* Crashlytics not set up in this build */ });
    });
  } catch {
    // Not set up in this build (no google-services.json): our own error reports still work
  }
}
