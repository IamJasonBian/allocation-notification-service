import type { Config } from "@netlify/functions";

/**
 * GET /api/whoami
 *
 * Re-verifies the caller's Netlify token against Netlify's own API and
 * (optionally) asserts team membership. Lets downstream services (e.g.
 * the allocation-agent CLI) treat "you have a Netlify token in our team"
 * as authentication without us issuing or rotating any new credentials.
 *
 * Required headers:
 *   Authorization: Bearer <netlify_personal_access_token>
 *
 * Optional env: AUTH_REQUIRED_TEAM (defaults to "Forecasting-Core-Infra";
 * empty string disables the check).
 *
 * 200 → { email, full_name, teams: string[] }
 * 401 → bad / missing / expired token
 * 403 → token valid but caller not in required team
 */

const NETLIFY_API = "https://api.netlify.com/api/v1";
const DEFAULT_TEAM = "Forecasting-Core-Infra";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

export default async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("", { status: 200, headers: CORS_HEADERS });
  }
  if (req.method !== "GET") {
    return text("method not allowed", 405);
  }

  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return json({ error: "missing bearer token" }, 401);
  const token = m[1].trim();

  let user: { email?: string; full_name?: string };
  try {
    const r = await fetch(`${NETLIFY_API}/user`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) {
      return json({ error: `netlify auth failed (${r.status})` }, 401);
    }
    user = (await r.json()) as { email?: string; full_name?: string };
  } catch (e) {
    return json(
      { error: `netlify /user unreachable: ${(e as Error).message}` },
      502,
    );
  }

  let teams: string[] = [];
  try {
    const r = await fetch(`${NETLIFY_API}/accounts`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (r.ok) {
      const accounts = (await r.json()) as Array<{ name?: string }>;
      teams = accounts.map((a) => a.name).filter((n): n is string => !!n);
    }
  } catch {
    // /accounts is optional for the team check — fall through with [].
  }

  const required = process.env.AUTH_REQUIRED_TEAM ?? DEFAULT_TEAM;
  if (required && !teams.includes(required)) {
    return json(
      { error: `not a member of ${required}`, teams },
      403,
    );
  }

  return json(
    {
      email: user.email || "",
      full_name: user.full_name || "",
      teams,
    },
    200,
  );
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function text(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "text/plain; charset=utf-8" },
  });
}

export const config: Config = {
  path: "/api/whoami",
};
