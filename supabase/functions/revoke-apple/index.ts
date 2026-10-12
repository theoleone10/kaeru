// Revokes the app's Sign in with Apple link for the signed-in user, as Apple requires
// when an account is deleted. The app sends a fresh authorization code (from a native
// Sign in with Apple prompt); this exchanges it for a refresh token and revokes that.
//
// Secrets: APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY (the .p8 contents),
// APPLE_CLIENT_ID (the app's bundle id, com.theoleone.kaeru).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { importPKCS8, SignJWT } from 'npm:jose@5';

const APPLE = 'https://appleid.apple.com';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing secret ${name}`);
  return v;
}

/** The short-lived ES256 client secret Apple's token endpoints expect. */
async function clientSecret(clientId: string): Promise<string> {
  const key = await importPKCS8(env('APPLE_PRIVATE_KEY').replace(/\\n/g, '\n'), 'ES256');
  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: env('APPLE_KEY_ID') })
    .setIssuer(env('APPLE_TEAM_ID'))
    .setIssuedAt()
    .setExpirationTime('5m')
    .setAudience(APPLE)
    .setSubject(clientId)
    .sign(key);
}

async function post(path: string, form: Record<string, string>): Promise<Response> {
  return fetch(`${APPLE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form),
  });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    // Only a signed-in user can call this (the gateway also checks the JWT).
    const auth = req.headers.get('Authorization') ?? '';
    const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: auth } } });
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return json({ error: 'Not signed in' }, 401);

    const { authorizationCode } = (await req.json()) as { authorizationCode?: string };
    if (!authorizationCode) return json({ error: 'Missing authorizationCode' }, 400);

    const clientId = env('APPLE_CLIENT_ID');
    const secret = await clientSecret(clientId);
    const tokenRes = await post('/auth/token', { client_id: clientId, client_secret: secret, code: authorizationCode, grant_type: 'authorization_code' });
    const tokens = (await tokenRes.json()) as { refresh_token?: string; access_token?: string; error?: string };
    const token = tokens.refresh_token ?? tokens.access_token;
    if (!tokenRes.ok || !token) return json({ error: `Apple token exchange failed: ${tokens.error ?? tokenRes.status}` }, 502);

    const revokeRes = await post('/auth/revoke', {
      client_id: clientId,
      client_secret: secret,
      token,
      token_type_hint: tokens.refresh_token ? 'refresh_token' : 'access_token',
    });
    if (!revokeRes.ok) return json({ error: `Apple revoke failed: ${revokeRes.status}` }, 502);
    return json({ revoked: true });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
