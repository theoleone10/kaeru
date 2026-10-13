import { parseAuthRedirect } from '@/auth/redirect';
import { validEmail } from '@/auth/validation';
import type { BackupData } from '@/backup/format';
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
  const data = (o: { cards?: number; logs?: number; flashcards?: number; entries?: string[] } = {}) =>
    ({
      cards: new Array(o.cards ?? 0).fill({}),
      review_logs: new Array(o.logs ?? 0).fill({}),
      time_entries: (o.entries ?? []).map((source) => ({ source })),
      anki: o.flashcards === undefined ? undefined : { anki_cards: new Array(o.flashcards).fill({}) },
    }) as unknown as BackupData;

  it('does nothing when both sides are empty', () => {
    expect(reconcileAction(data(), null)).toBe('none');
    expect(reconcileAction(data(), data())).toBe('none');
  });

  it('uploads phone progress to an empty account', () => {
    expect(reconcileAction(data({ cards: 5, logs: 20 }), null)).toBe('upload');
    expect(reconcileAction(data({ cards: 5, logs: 20 }), data())).toBe('upload');
  });

  it('restores account progress onto an empty phone', () => {
    expect(reconcileAction(data(), data({ cards: 3, logs: 9 }))).toBe('restore');
  });

  it('asks when both sides have progress', () => {
    expect(reconcileAction(data({ cards: 1 }), data({ cards: 3, logs: 9 }))).toBe('ask');
  });

  it('counts flashcards and time entries as progress, so they are never silently replaced', () => {
    expect(reconcileAction(data({ flashcards: 40 }), data({ cards: 3 }))).toBe('ask');
    expect(reconcileAction(data({ entries: ['timer'] }), data({ cards: 3 }))).toBe('ask');
    expect(reconcileAction(data({ entries: ['manual'] }), null)).toBe('upload');
    expect(reconcileAction(data(), data({ flashcards: 40 }))).toBe('restore');
  });

  it('ignores the automatic time-in-app entries a fresh install makes', () => {
    expect(reconcileAction(data({ entries: ['auto', 'auto'] }), data({ cards: 3 }))).toBe('restore');
  });
});
