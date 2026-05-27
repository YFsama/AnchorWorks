import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { t, useI18n } from '../i18n';

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

  it('returns the Chinese translation after switching to zh', () => {
    useI18n.setState({ lang: 'zh' });
    expect(t('Fill')).toBe('填充');
    expect(t('Cancel')).toBe('取消');
  });

  it('falls back to the key itself for unknown keys', () => {
    expect(t('___no-such-key___')).toBe('___no-such-key___');
    useI18n.setState({ lang: 'zh' });
    expect(t('___no-such-key___')).toBe('___no-such-key___');
  });

  it('switches back to English correctly', () => {
    useI18n.setState({ lang: 'zh' });
    expect(t('Fill')).toBe('填充');
    useI18n.setState({ lang: 'en' });
    expect(t('Fill')).toBe('Fill');
  });
});
