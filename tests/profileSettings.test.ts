import { AVATAR_COLORS, AVATARS } from '@/profile/avatars';
import { DEFAULT_SETTINGS, sanitizeSettings } from '@/state/settings';

describe('profile settings', () => {
  it('defaults: frog icon, kana off Today until chosen', () => {
    expect(sanitizeSettings({})).toMatchObject({ avatar: 'frog', avatarColor: 'green', studyKana: false });
    expect(AVATARS).toContain(DEFAULT_SETTINGS.avatar);
  });

  it('keeps a chosen icon, colour and kana choice', () => {
    expect(sanitizeSettings({ avatar: 'fox', avatarColor: 'gold', studyKana: true })).toMatchObject({ avatar: 'fox', avatarColor: 'gold', studyKana: true });
  });

  it('turns an emoji icon from an older version into the matching character', () => {
    expect(sanitizeSettings({ avatar: '🦊' }).avatar).toBe('fox');
    expect(sanitizeSettings({ avatar: '🐸' }).avatar).toBe('frog');
    expect(sanitizeSettings({ avatar: '⛩️' }).avatar).toBe('frog');
  });

  it('drops icons and colours that are not offered', () => {
    const s = sanitizeSettings({ avatar: '<img>', avatarColor: 'plaid', studyKana: 'yes' });
    expect(s).toMatchObject({ avatar: 'frog', avatarColor: 'green', studyKana: false });
  });

  it('offers distinct icons and colours', () => {
    expect(new Set(AVATARS).size).toBe(AVATARS.length);
    expect(Object.keys(AVATAR_COLORS).length).toBeGreaterThanOrEqual(4);
  });
});
