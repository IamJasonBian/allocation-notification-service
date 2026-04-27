import type { Config } from "@netlify/functions";

import {
  isEmailAllowed,
  signCliToken,
  verifyCliState,
  verifyGoogleIdToken,
} from "./_shared/auth.js";

/**
 * GET /auth/callback?code=&state=
 *
 * Google OAuth landing. Recovers the original loopback redirect_uri from
 * the signed state, exchanges the code with Google, verifies the id_token
 * against Google's JWKS, mints a CLI JWT, and 302s to the loopback with
 * ?token=<jwt> (or ?error=<msg> if anything fails).
 *
 * Required env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, OAUTH_REDIRECT_URL,
 * JWT_SECRET. Optional: AUTH_ALLOWED_EMAILS (comma-separated allow-list).
 */
export default async (req: Request) => {
  if (req.method !== "GET") {
    return text("method not allowed", 405);
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  // Recover redirect target first — without it we can't tell the CLI anything.
  let recovered: string | null = null;
  if (state) {
    try {
      recovered = (await verifyCliState(state)).redirect_uri;
    } catch {
      // fall through; reported below
    }
  }

  if (oauthError) {
    return recovered
      ? redirectWithError(recovered, oauthError)
      : text(`oauth error: ${oauthError}`, 400);
  }
  if (!code || !state) return text("missing code or state", 400);
  if (!recovered) return text("invalid or expired state", 400);

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const googleCallback = process.env.OAUTH_REDIRECT_URL;
  if (!clientId || !clientSecret || !googleCallback) {
    return redirectWithError(recovered, "server_not_configured");
  }

  let idToken: string;
  try {
    const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: googleCallback,
        grant_type: "authorization_code",
      }).toString(),
    });
    if (!tokenResp.ok) {
      return redirectWithError(
        recovered,
        `token_exchange_failed_${tokenResp.status}`,
      );
    }
    const tokenJson = (await tokenResp.json()) as { id_token?: string };
    if (!tokenJson.id_token) {
      return redirectWithError(recovered, "no_id_token");
    }
    idToken = tokenJson.id_token;
  } catch (e) {
    return redirectWithError(
      recovered,
      `exchange_error_${encodeURIComponent((e as Error).message)}`,
    );
  }

  let identity;
  try {
    identity = await verifyGoogleIdToken(idToken, clientId);
  } catch (e) {
    return redirectWithError(
      recovered,
      `id_token_verify_failed_${encodeURIComponent((e as Error).message)}`,
    );
  }

  if (!isEmailAllowed(identity.email)) {
    return redirectWithError(recovered, "email_not_allowed");
  }

  const jwt = await signCliToken({ sub: identity.sub, email: identity.email });
  const target = new URL(recovered);
  target.searchParams.set("token", jwt);
  return Response.redirect(target.toString(), 302);
};

function text(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

function redirectWithError(target: string, error: string): Response {
  const u = new URL(target);
  u.searchParams.set("error", error);
  return Response.redirect(u.toString(), 302);
}

export const config: Config = {
  path: "/auth/callback",
};
