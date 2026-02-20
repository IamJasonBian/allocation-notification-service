import type { Config } from "@netlify/functions";
import { getRedisClient, disconnectRedis } from "../../src/lib/redis.js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

/**
 * GET /api/jobs
 * Returns recent jobs with optional filters.
 *
 * Query params:
 *   company  — filter by boardToken (e.g. janestreet)
 *   tag      — filter by tag (e.g. quant, intern)
 *   location — filter by normalized location (e.g. new_york)
 *   dept     — filter by normalized department
 *   limit    — max results (default 20, max 100)
 *   offset   — pagination offset (default 0)
 */
export default async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("", { status: 200, headers: CORS_HEADERS });
  }

  const url = new URL(req.url);
  const company = url.searchParams.get("company");
  const tag = url.searchParams.get("tag");
  const location = url.searchParams.get("location");
  const dept = url.searchParams.get("dept");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "20", 10), 100);
  const offset = parseInt(url.searchParams.get("offset") || "0", 10);

  const redis = getRedisClient();

  try {
    let compositeKeys: string[];

    const filterSets: string[] = [];
    if (company) filterSets.push(`idx:company:${company}`);
    if (tag) filterSets.push(`idx:tag:${tag}`);
    if (location) filterSets.push(`idx:location:${location}`);
    if (dept) filterSets.push(`idx:dept:${dept}`);

    if (filterSets.length === 0) {
      // No filters: pull from time-ordered feed
      compositeKeys = await redis.zrevrange("feed:new", offset, offset + limit - 1);
    } else {
      // Intersect filter sets with active jobs
      filterSets.push("idx:status:active");
      const matchingKeys = await redis.sinter(...filterSets);

      // Score each by feed:new timestamp for ordering
      const scored: { key: string; score: number }[] = [];
      for (const key of matchingKeys) {
        const score = await redis.zscore("feed:new", key);
        if (score !== null) {
          scored.push({ key, score: parseFloat(score) });
        }
      }
      scored.sort((a, b) => b.score - a.score);
      compositeKeys = scored.slice(offset, offset + limit).map((s) => s.key);
    }

    // Hydrate each composite key into full job data
    const jobs = await Promise.all(
      compositeKeys.map(async (ck) => {
        const [boardToken, jobId] = ck.split(":", 2);
        const data = await redis.hgetall(`jobs:${boardToken}:${jobId}`);
        return Object.keys(data).length > 0 ? data : null;
      }),
    );

    const validJobs = jobs.filter(Boolean);

    return new Response(
      JSON.stringify({ count: validJobs.length, offset, limit, jobs: validJobs }, null, 2),
      {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      },
    );
  } finally {
    await disconnectRedis();
  }
};

export const config: Config = {
  path: "/api/jobs",
};
