import type { Session, User } from '@supabase/supabase-js';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Linking from 'expo-linking';
import { useSQLiteContext } from 'expo-sqlite';
import * as WebBrowser from 'expo-web-browser';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { getKv, setKv } from '../db/repo';
import { parseAuthRedirect } from './redirect';
import { authConfigured, supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

export type OAuthProvider = 'apple' | 'google';

interface AuthContextValue {
  /** False when no Supabase project is configured: accounts are hidden entirely. */
  configured: boolean;
  session: Session | null;
  user: User | null;
  /** The user has passed the welcome screen (signed in or chose to continue without an account). */
  onboarded: boolean;
  finishOnboarding: () => Promise<void>;
  signInWithApple: () => Promise<boolean>;
  signInWithGoogle: () => Promise<boolean>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  /** Returns true when the account still needs its email confirmed. */
  signUpWithEmail: (email: string, password: string) => Promise<boolean>;
  sendPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  /** Handle a deep link carrying an auth code (email confirmation, password reset). */
  completeFromUrl: (url: string) => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AUTH_REDIRECT = 'auth-callback';

function client() {
  if (!supabase) throw new Error('Accounts are not set up for this build.');
  return supabase;
}

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [session, setSession] = useState<Session | null>(null);
  const [onboarded, setOnboarded] = useState(false);
  const [ready, setReady] = useState(!authConfigured);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    (async () => {
      const meta = await getKv(db, 'meta');
      const { data } = await supabase.auth.getSession();
      if (!alive) return;
      setSession(data.session);
      setOnboarded(meta.onboarded === true || data.session !== null);
      setReady(true);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [db]);

  const finishOnboarding = useCallback(async () => {
    await setKv(db, 'meta', 'onboarded', true);
    setOnboarded(true);
  }, [db]);

  const completeFromUrl = useCallback(async (url: string) => {
    const { code, error } = parseAuthRedirect(url);
    if (error) throw new Error(error);
    if (!code) return;
    const { error: exchangeError } = await client().auth.exchangeCodeForSession(code);
    fail(exchangeError);
  }, []);

  const signInWithOAuth = useCallback(
    async (provider: OAuthProvider): Promise<boolean> => {
      const redirectTo = Linking.createURL(AUTH_REDIRECT);
      const { data, error } = await client().auth.signInWithOAuth({ provider, options: { redirectTo, skipBrowserRedirect: true } });
      fail(error);
      if (!data.url) throw new Error('Could not start sign-in.');
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type !== 'success') return false; // cancelled or dismissed
      await completeFromUrl(result.url);
      return true;
    },
    [completeFromUrl],
  );

  const signInWithApple = useCallback(async (): Promise<boolean> => {
    // iOS uses the native Sign in with Apple sheet (App Store guideline 4.8);
    // Android and web fall back to Apple's web flow.
    if (Platform.OS !== 'ios') return signInWithOAuth('apple');
    let credential: AppleAuthentication.AppleAuthenticationCredential;
    try {
      credential = await AppleAuthentication.signInAsync({
        requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      });
    } catch (e) {
      if (e && typeof e === 'object' && 'code' in e && e.code === 'ERR_REQUEST_CANCELED') return false;
      throw e;
    }
    if (!credential.identityToken) throw new Error('Apple did not return an identity token.');
    const { error } = await client().auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken });
    fail(error);
    // Apple only shares the name on the very first sign-in, so keep it.
    const name = credential.fullName ? AppleAuthentication.formatFullName(credential.fullName) : '';
    if (name) await client().auth.updateUser({ data: { full_name: name } });
    return true;
  }, [signInWithOAuth]);

  const signInWithGoogle = useCallback(() => signInWithOAuth('google'), [signInWithOAuth]);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const { error } = await client().auth.signInWithPassword({ email: email.trim(), password });
    fail(error);
  }, []);

  const signUpWithEmail = useCallback(async (email: string, password: string) => {
    const { data, error } = await client().auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: Linking.createURL(AUTH_REDIRECT) },
    });
    fail(error);
    return data.session === null;
  }, []);

  const sendPasswordReset = useCallback(async (email: string) => {
    const { error } = await client().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: Linking.createURL(AUTH_REDIRECT, { queryParams: { next: 'new-password' } }),
    });
    fail(error);
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    const { error } = await client().auth.updateUser({ password });
    fail(error);
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await client().auth.signOut();
    fail(error);
  }, []);

  const deleteAccount = useCallback(async () => {
    // Server-side function removes the auth user; cloud progress cascades with it.
    const { error } = await client().rpc('delete_account');
    fail(error);
    await client().auth.signOut({ scope: 'local' });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      configured: authConfigured,
      session,
      user: session?.user ?? null,
      onboarded: !authConfigured || onboarded,
      finishOnboarding,
      signInWithApple,
      signInWithGoogle,
      signInWithEmail,
      signUpWithEmail,
      sendPasswordReset,
      updatePassword,
      completeFromUrl,
      signOut,
      deleteAccount,
    }),
    [session, onboarded, finishOnboarding, signInWithApple, signInWithGoogle, signInWithEmail, signUpWithEmail, sendPasswordReset, updatePassword, completeFromUrl, signOut, deleteAccount],
  );

  if (!ready) return null;
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** Human-readable name for the signed-in account. */
export function accountLabel(user: User): string {
  const name = typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : '';
  return name || user.email || 'Signed in';
}
