import type { Config } from "@netlify/functions";
import { getRedisClient, disconnectRedis } from "../../src/lib/redis.js";

/**
 * /api/redis/key?k=<key>
 *   GET    — fetch value for any Redis key (auto-detects type)
 *   DELETE — delete the key
 */
export default async (req: Request) => {
  const redis = getRedisClient();

  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("k");

    if (!key) {
      return json({ error: "Missing ?k= parameter" }, 400);
    }

    if (req.method === "DELETE") {
      const existed = await redis.del(key);
      return json({ deleted: existed === 1, key });
    }

    // GET — fetch value by type
    const type = await redis.type(key);

    if (type === "none") {
      return json({ error: `Key '${key}' does not exist` }, 404);
    }

    let value: unknown;
    let meta: Record<string, unknown> = { key, type };

    switch (type) {
      case "string":
        value = await redis.get(key);
        break;
      case "hash":
        value = await redis.hgetall(key);
        meta.fieldCount = Object.keys(value as object).length;
        break;
      case "list": {
        const len = await redis.llen(key);
        const limit = parseInt(url.searchParams.get("limit") || "100", 10);
        value = await redis.lrange(key, 0, limit - 1);
        meta.length = len;
        break;
      }
      case "set": {
        const size = await redis.scard(key);
        value = await redis.smembers(key);
        meta.size = size;
        break;
      }
      case "zset": {
        const size = await redis.zcard(key);
        const limit = parseInt(url.searchParams.get("limit") || "100", 10);
        value = await redis.zrange(key, 0, limit - 1, "WITHSCORES");
        meta.size = size;
        break;
      }
      default:
        value = null;
    }

    return json({ ...meta, value });
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
  path: "/api/redis/key",
};
