/**
 * Minimal client-side JWT payload decoder. This never verifies the
 * signature (the backend is the only party that needs to trust the token);
 * it's used purely to read `sub` (user id) out of an access token right
 * after login so the SPA can fetch the full user profile via
 * `GET /users/{id}` — the API has no `/users/me` endpoint (see the live
 * OpenAPI schema), only `GET /users/{id}`, and the access token's `sub`
 * claim (backend/src/app/core/security.py: create_access_token) is exactly
 * the authenticated user's id.
 */
export interface AccessTokenPayload {
  sub: string;
  org_id: string;
  role: "admin" | "member";
  type: string;
  iat: number;
  exp: number;
}

export function decodeAccessToken(token: string): AccessTokenPayload {
  const [, payloadB64] = token.split(".");
  if (!payloadB64) {
    throw new Error("Malformed access token");
  }
  const base64 = payloadB64.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const json = atob(padded);
  return JSON.parse(json) as AccessTokenPayload;
}
