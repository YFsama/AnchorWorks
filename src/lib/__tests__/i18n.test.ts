import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { t, useI18n, ensureZhLoaded } from '../i18n';

describe('i18n.t', () => {
  beforeEach(() => {
    useI18n.setState({ lang: 'en' });
  });

  afterEach(() => {
    useI18n.setState({ lang: 'en' });
  });

  it('returns the English source string in en mode', () => {
    expect(t('Fill')).toBe('Fill');
    expect(t('Cancel')).toBe('Cancel');
  });

  it('returns enOverrides when the display text differs from the key', () => {
    expect(t('Proof print settings')).toBe('A4 portrait, fit, 10 mm margin');
    expect(t('2×2 repeat')).toBe('2×2');
  });

  it('returns the Chinese translation after switching to zh', async () => {
    useI18n.setState({ lang: 'zh' });
    // The zh dictionary is a lazy chunk — wait for it before asserting.
    await ensureZhLoaded();
    expect(t('Fill')).toBe('填充');
    expect(t('Cancel')).toBe('取消');
    expect(t('Preferences')).toBe('偏好设置');
  });

  it('falls back to the key itself for unknown keys', async () => {
    expect(t('___no-such-key___')).toBe('___no-such-key___');
    useI18n.setState({ lang: 'zh' });
    await ensureZhLoaded();
    expect(t('___no-such-key___')).toBe('___no-such-key___');
  });

  it('never returns a non-string while the zh chunk is pending', () => {
    // Regression guard for the pre-load window: an unloaded dictionary
    // must render English (or the override), never undefined/crash.
    // The ready flag alone only drives React re-renders, so forcing it
    // false must not change t()'s output shape.
    useI18n.setState({ lang: 'zh', zhReady: false });
    expect(typeof t('Fill')).toBe('string');
    expect(t('Fill').length).toBeGreaterThan(0);
  });

  it('switches back to English correctly', async () => {
    useI18n.setState({ lang: 'zh' });
    await ensureZhLoaded();
    expect(t('Fill')).toBe('填充');
    useI18n.setState({ lang: 'en' });
    expect(t('Fill')).toBe('Fill');
  });
});
