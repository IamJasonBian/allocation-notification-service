import type { Config } from "@netlify/functions";

import {
  signCliState,
  validateLoopbackRedirect,
} from "./_shared/auth.js";

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";

/**
 * GET /auth/cli?redirect_uri=<loopback>
 *
 * Entry point for the CLI sign-in flow. Validates the loopback redirect_uri
 * against the RFC 8252 native-app rules, signs it into an OAuth `state`
 * token, and redirects to Google. Google bounces back to OAUTH_REDIRECT_URL
 * (this site's /auth/callback), which then 302s to the loopback with a JWT.
 *
 * Required env: GOOGLE_CLIENT_ID, OAUTH_REDIRECT_URL, JWT_SECRET.
 */
export default async (req: Request) => {
  if (req.method !== "GET") {
    return text("method not allowed", 405);
  }

  const url = new URL(req.url);
  const redirect = url.searchParams.get("redirect_uri");
  if (!redirect) return text("redirect_uri query param required", 400);

  let validated: string;
  try {
    validated = validateLoopbackRedirect(redirect);
  } catch (e) {
    return text(`invalid redirect_uri: ${(e as Error).message}`, 400);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const googleCallback = process.env.OAUTH_REDIRECT_URL;
  if (!clientId || !googleCallback) {
    return text(
      "server not configured (missing GOOGLE_CLIENT_ID or OAUTH_REDIRECT_URL)",
      500,
    );
  }

  const state = await signCliState({ redirect_uri: validated });
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: googleCallback,
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  });

  return Response.redirect(`${GOOGLE_AUTH}?${params.toString()}`, 302);
};

function text(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

export const config: Config = {
  path: "/auth/cli",
};
