import { parseAuthRedirect } from '@/auth/redirect';
import { validEmail } from '@/auth/validation';
import type { BackupFile } from '@/backup/format';
import { reconcileAction } from '@/sync/cloud';

jest.mock('@/auth/supabase', () => ({ supabase: null, authConfigured: false }));

describe('parseAuthRedirect', () => {
  it('reads a PKCE code from the query', () => {
    expect(parseAuthRedirect('kaeru://auth-callback?code=abc-123&next=new-password')).toEqual({ code: 'abc-123' });
  });

  it('reads errors from the fragment, decoding them', () => {
    expect(parseAuthRedirect('kaeru://auth-callback#error=access_denied&error_description=Email+link+is+invalid')).toEqual({
      error: 'Email link is invalid',
    });
  });

  it('returns nothing for a bare URL', () => {
    expect(parseAuthRedirect('kaeru://auth-callback')).toEqual({});
  });
});

describe('validEmail', () => {
  it.each([
    ['a@b.co', true],
    ['  name@example.com ', true],
    ['no-at-sign', false],
    ['a@b', false],
    ['a b@c.com', false],
  ])('%s → %s', (email, ok) => {
    expect(validEmail(email)).toBe(ok);
  });
});

describe('reconcileAction', () => {
  const remote = (cards: number, logs: number) =>
    ({ cards: new Array(cards).fill({}), review_logs: new Array(logs).fill({}) }) as unknown as BackupFile;

  it('does nothing when both sides are empty', () => {
    expect(reconcileAction(0, 0, null)).toBe('none');
    expect(reconcileAction(0, 0, remote(0, 0))).toBe('none');
  });

  it('uploads phone progress to an empty account', () => {
    expect(reconcileAction(5, 20, null)).toBe('upload');
    expect(reconcileAction(5, 20, remote(0, 0))).toBe('upload');
  });

  it('restores account progress onto an empty phone', () => {
    expect(reconcileAction(0, 0, remote(3, 9))).toBe('restore');
  });

  it('asks when both sides have progress', () => {
    expect(reconcileAction(1, 0, remote(3, 9))).toBe('ask');
  });
});
