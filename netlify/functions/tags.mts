import type { Config } from "@netlify/functions";
import { getRedisClient, disconnectRedis } from "../../src/lib/redis.js";
import {
  createTag,
  updateTag,
  deleteTag,
  getTag,
  getAllActiveTags,
  getTagHistory,
} from "../../src/lib/tag-store.js";

/**
 * /api/tags — Tag definition CRUD with temporal history
 *
 *   GET              — list all active tags
 *   GET ?name=X      — get single tag definition
 *   GET ?name=X&history=true — get tag with version history
 *   POST             — create tag { title, description, threshold?, enabled? }
 *   PUT              — update tag { title, description?, threshold?, enabled? }
 *   DELETE ?name=X   — disable (soft-delete) tag
 */
export default async (req: Request) => {
  const redis = getRedisClient();

  try {
    const url = new URL(req.url);

    if (req.method === "GET") {
      const name = url.searchParams.get("name");
      if (name) {
        const showHistory = url.searchParams.get("history") === "true";
        const tag = await getTag(redis, name);
        if (!tag) return json({ error: `Tag '${name}' not found` }, 404);
        if (showHistory) {
          const history = await getTagHistory(redis, name);
          return json({ ...tag, history });
        }
        return json(tag);
      }
      const tags = await getAllActiveTags(redis);
      return json(tags);
    }

    if (req.method === "POST") {
      const body = await req.json() as {
        title?: string;
        description?: string;
        threshold?: number;
        enabled?: boolean;
      };
      if (!body.title || !body.description) {
        return json({ error: "Missing title or description" }, 400);
      }
      const existing = await getTag(redis, body.title);
      if (existing) {
        return json({ error: `Tag '${body.title}' already exists. Use PUT to update.` }, 409);
      }
      const tag = await createTag(redis, {
        title: body.title,
        description: body.description,
        threshold: body.threshold,
        enabled: body.enabled,
      });
      return json(tag, 201);
    }

    if (req.method === "PUT") {
      const body = await req.json() as {
        title?: string;
        description?: string;
        threshold?: number;
        enabled?: boolean;
      };
      if (!body.title) {
        return json({ error: "Missing title" }, 400);
      }
      const updates: Record<string, any> = {};
      if (body.description !== undefined) updates.description = body.description;
      if (body.threshold !== undefined) updates.threshold = body.threshold;
      if (body.enabled !== undefined) updates.enabled = body.enabled;

      const tag = await updateTag(redis, body.title, updates);
      if (!tag) return json({ error: `Tag '${body.title}' not found` }, 404);
      return json(tag);
    }

    if (req.method === "DELETE") {
      const url = new URL(req.url);
      const name = url.searchParams.get("name");
      if (!name) return json({ error: "Missing ?name= parameter" }, 400);
      const ok = await deleteTag(redis, name);
      if (!ok) return json({ error: `Tag '${name}' not found` }, 404);
      return json({ ok: true, disabled: name });
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (error: any) {
    console.error("Error in /api/tags:", error);
    return json({ error: error.message }, 500);
  } finally {
    await disconnectRedis();
  }
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const config: Config = {
  path: "/api/tags",
};
