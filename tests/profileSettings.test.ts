import { AVATAR_COLORS, AVATARS } from '@/profile/avatars';
import { DEFAULT_SETTINGS, sanitizeSettings } from '@/state/settings';

describe('profile settings', () => {
  it('defaults: frog icon, kana off Today until chosen', () => {
    expect(sanitizeSettings({})).toMatchObject({ avatar: '🐸', avatarColor: 'green', studyKana: false });
    expect(AVATARS).toContain(DEFAULT_SETTINGS.avatar);
  });

  it('keeps a chosen icon, colour and kana choice', () => {
    expect(sanitizeSettings({ avatar: '🦊', avatarColor: 'gold', studyKana: true })).toMatchObject({ avatar: '🦊', avatarColor: 'gold', studyKana: true });
  });

  it('drops icons and colours that are not offered', () => {
    const s = sanitizeSettings({ avatar: '<img>', avatarColor: 'plaid', studyKana: 'yes' });
    expect(s).toMatchObject({ avatar: '🐸', avatarColor: 'green', studyKana: false });
  });

  it('offers distinct icons and colours', () => {
    expect(new Set(AVATARS).size).toBe(AVATARS.length);
    expect(Object.keys(AVATAR_COLORS).length).toBeGreaterThanOrEqual(4);
  });
});
