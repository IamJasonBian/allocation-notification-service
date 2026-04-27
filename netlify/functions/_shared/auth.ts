/**
 * Shared auth helpers for the CLI sign-in flow.
 *
 * Flow: client (CLI) → /auth/cli (this site) → Google OAuth → /auth/callback
 * (this site) → 302 to client loopback with ?token=<jwt>.
 *
 * The CLI's loopback redirect_uri is signed into the OAuth `state` parameter
 * with `JWT_SECRET` so the callback can recover and verify it without a
 * server-side store. The id_token returned by Google is verified against
 * Google's JWKS (RS256) before we trust the email.
 */

import { SignJWT, jwtVerify, createRemoteJWKSet } from "jose";

const STATE_TTL_SECONDS = 300;            // 5 min — matches normal OAuth timing
const TOKEN_TTL_SECONDS = 30 * 24 * 3600; // 30 days for CLI tokens

const ALG = "HS256";
const STATE_SUBJECT = "cli-state";
const TOKEN_AUDIENCE = "cli";

const ALLOWED_REDIRECT_HOSTS = new Set(["127.0.0.1", "localhost"]);

const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
const GOOGLE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);

function getJwtSecret(): Uint8Array {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET not set");
  return new TextEncoder().encode(s);
}

export interface CliState {
  redirect_uri: string;
}

export async function signCliState(state: CliState): Promise<string> {
  return await new SignJWT({ redirect_uri: state.redirect_uri })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(`${STATE_TTL_SECONDS}s`)
    .setSubject(STATE_SUBJECT)
    .sign(getJwtSecret());
}

export async function verifyCliState(token: string): Promise<CliState> {
  const { payload } = await jwtVerify(token, getJwtSecret(), {
    subject: STATE_SUBJECT,
  });
  const redirect = payload.redirect_uri;
  if (typeof redirect !== "string") {
    throw new Error("invalid state payload");
  }
  return { redirect_uri: redirect };
}

export interface CliClaims {
  sub: string;
  email: string;
}

export async function signCliToken(claims: CliClaims): Promise<string> {
  return await new SignJWT({ email: claims.email })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_TTL_SECONDS}s`)
    .setSubject(claims.sub)
    .setAudience(TOKEN_AUDIENCE)
    .sign(getJwtSecret());
}

/**
 * Per RFC 8252 §7.3, native apps use a loopback IP redirect:
 *   - http scheme
 *   - host 127.0.0.1 (or localhost)
 *   - any unprivileged port
 *   - fixed path (we require /callback)
 *   - no query / fragment
 */
export function validateLoopbackRedirect(uri: string): string {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    throw new Error("redirect_uri is not a valid URL");
  }
  if (parsed.protocol !== "http:") {
    throw new Error("redirect_uri must use http:// (loopback only)");
  }
  if (!ALLOWED_REDIRECT_HOSTS.has(parsed.hostname)) {
    throw new Error("redirect_uri host must be 127.0.0.1 or localhost");
  }
  const port = parseInt(parsed.port, 10);
  if (!port || port < 1024 || port > 65535) {
    throw new Error("redirect_uri port must be in 1024-65535");
  }
  if (parsed.pathname !== "/callback") {
    throw new Error("redirect_uri path must be /callback");
  }
  if (parsed.search || parsed.hash) {
    throw new Error("redirect_uri must not have query or fragment");
  }
  return parsed.toString();
}

export function isEmailAllowed(email: string): boolean {
  const allow = (process.env.AUTH_ALLOWED_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (allow.length === 0) return true;
  return allow.includes(email.toLowerCase());
}

export interface GoogleIdentity {
  sub: string;
  email: string;
}

export async function verifyGoogleIdToken(
  idToken: string,
  audience: string,
): Promise<GoogleIdentity> {
  const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
    issuer: GOOGLE_ISSUERS,
    audience,
  });
  const sub = typeof payload.sub === "string" ? payload.sub : "";
  const email = typeof payload.email === "string" ? payload.email.toLowerCase() : "";
  if (!sub || !email) throw new Error("id_token missing sub or email");
  return { sub, email };
}
