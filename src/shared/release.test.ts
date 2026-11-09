import { describe, expect, it } from 'vitest';
import { isNewer } from './release';

describe('isNewer', () => {
  it('is true only when the website has a higher version code', () => {
    expect(isNewer({ versionCode: 2 }, 1)).toBe(true);
    expect(isNewer({ versionCode: 1 }, 1)).toBe(false);
    expect(isNewer({ versionCode: 1 }, 3)).toBe(false);
  });

  it('ignores a missing or broken version file', () => {
    expect(isNewer(null, 1)).toBe(false);
    expect(isNewer({ versionCode: Number('x') }, 1)).toBe(false);
  });
});
