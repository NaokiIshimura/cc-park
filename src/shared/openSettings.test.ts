import { describe, expect, it } from 'vitest';
import { DEFAULT_OPEN_SETTINGS, FALLBACK_APPS, toOpenSettings } from './openSettings.js';

describe('toOpenSettings', () => {
  it('既定は Terminal', () => {
    expect(DEFAULT_OPEN_SETTINGS).toEqual({ fallbackApp: 'Terminal' });
  });

  it.each(FALLBACK_APPS)('%s はそのまま受け取る', (fallbackApp) => {
    expect(toOpenSettings({ fallbackApp })).toEqual({ fallbackApp });
  });

  it('知らないアプリ・壊れた値は既定にする', () => {
    expect(toOpenSettings({ fallbackApp: 'Warp' })).toEqual(DEFAULT_OPEN_SETTINGS);
    expect(toOpenSettings({ fallbackApp: 1 })).toEqual(DEFAULT_OPEN_SETTINGS);
    expect(toOpenSettings(null)).toEqual(DEFAULT_OPEN_SETTINGS);
    expect(toOpenSettings('Terminal')).toEqual(DEFAULT_OPEN_SETTINGS);
  });
});
