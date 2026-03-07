import type { Config } from "@netlify/functions";
import { getRedisClient, disconnectRedis } from "../../src/lib/redis.js";

/**
 * /api/redis/keys
 *   GET  ?pattern=jobs:*  — list keys matching a glob pattern
 *   DELETE ?key=somekey   — delete a specific key
 */
export default async (req: Request) => {
  const redis = getRedisClient();

  try {
    const url = new URL(req.url);

    if (req.method === "DELETE") {
      const key = url.searchParams.get("key");
      if (!key) {
        return json({ error: "Missing ?key= parameter" }, 400);
      }
      const existed = await redis.del(key);
      return json({ deleted: existed === 1, key });
    }

    // GET — list keys
    const pattern = url.searchParams.get("pattern") || "*";
    const limit = parseInt(url.searchParams.get("limit") || "200", 10);

    const keys = await redis.keys(pattern);
    const limited = keys.slice(0, limit);

    // Get type for each key
    const entries = await Promise.all(
      limited.map(async (key) => {
        const type = await redis.type(key);
        return { key, type };
      }),
    );

    return json({
      pattern,
      totalMatches: keys.length,
      count: entries.length,
      keys: entries,
    });
  } catch (error: any) {
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
  path: "/api/redis/keys",
};
