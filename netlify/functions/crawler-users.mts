import type { Config } from "@netlify/functions";
import { getRedisClient, disconnectRedis } from "../../src/lib/redis.js";

/**
 * /api/crawler/users
 *   GET  ?id=<userId> — fetch user profile
 *   POST — create/update user profile (JSON or multipart for resume upload)
 */
export default async (req: Request) => {
  const redis = getRedisClient();

  try {
    if (req.method === "GET") {
      return await handleGetUser(redis, req);
    }

    if (req.method === "POST") {
      return await handlePostUser(redis, req);
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (error: any) {
    console.error("Error in /api/crawler/users:", error);
    return json({ error: error.message }, 500);
  } finally {
    await disconnectRedis();
  }
};

/** GET /api/crawler/users?id=<userId> */
async function handleGetUser(redis: any, req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  if (!id) {
    return json({ error: "Missing ?id= parameter" }, 400);
  }

  const data = await redis.hgetall(`user:${id}`);
  if (!data || Object.keys(data).length === 0) {
    return json({ error: `User '${id}' not found` }, 404);
  }

  return json({
    id: data.id || id,
    resumes: safeParse(data.resumes, []),
    answers: safeParse(data.answers, {}),
    tags: safeParse(data.tags, []),
    updated_at: data.updated_at || null,
  });
}

/** POST /api/crawler/users — body: { id, resumes?, answers?, tags? } */
async function handlePostUser(redis: any, req: Request) {
  const contentType = req.headers.get("content-type") || "";

  // Handle multipart/form-data (resume upload)
  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const userId = formData.get("userId") as string;
    const file = formData.get("file") as File | null;

    if (!userId) {
      return json({ error: "Missing userId in form data" }, 400);
    }

    // Store resume reference
    if (file) {
      const resumeKey = `uploads/${userId}/${file.name}`;
      const existing = await redis.hget(`user:${userId}`, "resumes");
      const resumes = safeParse(existing, []);
      if (!resumes.includes(resumeKey)) {
        resumes.push(resumeKey);
      }

      await redis.hset(`user:${userId}`, {
        id: userId,
        resumes: JSON.stringify(resumes),
        updated_at: new Date().toISOString(),
      });
    }

    return json({ ok: true, id: userId });
  }

  // Handle JSON body
  const body = await req.json() as { id?: string; resumes?: any; answers?: any; tags?: any };
  const { id, resumes, answers, tags } = body;

  if (!id) {
    return json({ error: "Missing id in request body" }, 400);
  }

  const fields: Record<string, string> = {
    id,
    updated_at: new Date().toISOString(),
  };

  if (resumes !== undefined) fields.resumes = JSON.stringify(resumes);
  if (answers !== undefined) fields.answers = JSON.stringify(answers);
  if (tags !== undefined) fields.tags = JSON.stringify(tags);

  await redis.hset(`user:${id}`, fields);

  return json({ ok: true, id });
}

function safeParse(val: string | null | undefined, fallback: any): any {
  if (!val) return fallback;
  try { return JSON.parse(val); } catch { return fallback; }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const config: Config = {
  path: "/api/crawler/users",
};
