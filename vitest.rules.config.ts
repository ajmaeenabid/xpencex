import { defineConfig } from 'vitest/config';

// Only the Firestore rules tests (tests/rules), which need the emulator: run them with `npm run test:rules`
export default defineConfig({
  test: {
    include: ['tests/rules/**/*.test.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 60000,
  },
});
