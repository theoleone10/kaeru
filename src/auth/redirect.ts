/** Pull `code` (PKCE) or an error out of a redirect URL (query or fragment). */
export function parseAuthRedirect(url: string): { code?: string; error?: string; type?: string } {
  const out: { code?: string; error?: string; type?: string } = {};
  const parts = url.split(/[?#]/).slice(1).join('&');
  for (const pair of parts.split('&')) {
    const [k, v = ''] = pair.split('=');
    const value = decodeURIComponent(v.replace(/\+/g, ' '));
    if (k === 'code') out.code = value;
    else if (k === 'error_description') out.error = value;
    else if (k === 'error' && !out.error) out.error = value;
    else if (k === 'type') out.type = value;
  }
  return out;
}
