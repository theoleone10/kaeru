// The app imports this as it starts; a throw there closes a release build at once.
jest.mock('expo-sqlite/localStorage/install', () => ({}));
(globalThis as { localStorage?: unknown }).localStorage = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };

function load(url: string | undefined, key: string | undefined) {
  // Assigning undefined to process.env stores the string "undefined", so delete instead.
  if (url === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_URL;
  else process.env.EXPO_PUBLIC_SUPABASE_URL = url;
  if (key === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_KEY;
  else process.env.EXPO_PUBLIC_SUPABASE_KEY = key;
  let mod: typeof import('@/auth/supabase') | undefined;
  jest.isolateModules(() => {
    mod = require('@/auth/supabase');
  });
  return mod!;
}

describe('Supabase setup at startup', () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  afterAll(() => warn.mockRestore());

  it('connects with a valid URL and key', () => {
    expect(load('https://abcdefgh.supabase.co', 'sb_publishable_x').authConfigured).toBe(true);
  });

  it.each(['"https://abcdefgh.supabase.co"', 'EXPO_PUBLIC_SUPABASE_URL=https://abcdefgh.supabase.co', 'abcdefgh.supabase.co'])(
    'runs offline instead of throwing for %s',
    (url) => {
      const mod = load(url, 'sb_publishable_x');
      expect(mod.supabase).toBeNull();
      expect(mod.authConfigured).toBe(false);
    },
  );

  it('runs offline without settings', () => {
    expect(load(undefined, undefined).authConfigured).toBe(false);
  });
});
