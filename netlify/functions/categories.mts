import type { Config } from "@netlify/functions";
import type Redis from "ioredis";
import { companies } from "../../src/config/companies.js";
import { getRedisClient, disconnectRedis } from "../../src/lib/redis.js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

/**
 * GET /api/categories
 * Returns available filter values (tags, locations, departments, companies)
 * with active job counts for each.
 */
export default async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("", { status: 200, headers: CORS_HEADERS });
  }

  const redis = getRedisClient();

  try {
    const activeKeys = await redis.smembers("idx:status:active");
    const activeSet = new Set(activeKeys);

    const [tagKeys, locKeys, deptKeys] = await Promise.all([
      scanKeys(redis, "idx:tag:*"),
      scanKeys(redis, "idx:location:*"),
      scanKeys(redis, "idx:dept:*"),
    ]);

    const [tags, locations, departments] = await Promise.all([
      getCategoryCounts(redis, tagKeys, "idx:tag:", activeSet),
      getCategoryCounts(redis, locKeys, "idx:location:", activeSet),
      getCategoryCounts(redis, deptKeys, "idx:dept:", activeSet),
    ]);

    // Company counts via set intersection with active
    const companyStats = await Promise.all(
      companies.map(async (c) => {
        const members = await redis.smembers(`idx:company:${c.boardToken}`);
        const activeCount = members.filter((m) => activeSet.has(m)).length;
        return { boardToken: c.boardToken, displayName: c.displayName, activeCount };
      }),
    );

    return new Response(
      JSON.stringify({
        tags: tags.filter((t) => t.count > 0).sort((a, b) => b.count - a.count),
        locations: locations.filter((l) => l.count > 0).sort((a, b) => b.count - a.count),
        departments: departments.filter((d) => d.count > 0).sort((a, b) => b.count - a.count),
        companies: companyStats.filter((c) => c.activeCount > 0).sort((a, b) => b.activeCount - a.activeCount),
      }, null, 2),
      {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      },
    );
  } finally {
    await disconnectRedis();
  }
};

async function scanKeys(redis: Redis, pattern: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor = "0";
  do {
    const [nextCursor, batch] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 200);
    cursor = nextCursor;
    keys.push(...batch);
  } while (cursor !== "0");
  return keys;
}

async function getCategoryCounts(
  redis: Redis,
  keys: string[],
  prefix: string,
  activeSet: Set<string>,
): Promise<Array<{ name: string; count: number }>> {
  return Promise.all(
    keys.map(async (key) => {
      const name = key.slice(prefix.length);
      const members = await redis.smembers(key);
      const count = members.filter((m) => activeSet.has(m)).length;
      return { name, count };
    }),
  );
}

export const config: Config = {
  path: "/api/categories",
};
