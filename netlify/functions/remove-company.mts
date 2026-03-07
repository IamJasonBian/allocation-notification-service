import type { Config } from "@netlify/functions";
import { getRedisClient, disconnectRedis } from "../../src/lib/redis.js";
import { archiveAndRemoveCompany } from "../../src/lib/archiver.js";

/**
 * DELETE /api/companies/:boardToken
 * Archives all job data for a company to Netlify Blobs (S3), then:
 *   1. Deletes all Redis keys (jobs, indexes, feeds, stats, metadata)
 *   2. Adds boardToken to `meta:removed_companies` set so the crawler
 *      and /api/companies skip it at runtime (removes from config).
 *
 * Requires NETLIFY_SITE_ID and NETLIFY_API_TOKEN env vars for blob storage.
 */
export default async (req: Request) => {
  if (req.method !== "DELETE") {
    return new Response(
      JSON.stringify({ error: "Method not allowed. Use DELETE." }),
      { status: 405, headers: { "Content-Type": "application/json" } },
    );
  }

  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter(Boolean);
  // Expect: ["api", "companies", "<boardToken>"]
  const boardToken = segments[2];

  if (!boardToken) {
    return new Response(
      JSON.stringify({ error: "Missing boardToken in path. Use DELETE /api/companies/{boardToken}" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const siteID = process.env.NETLIFY_SITE_ID || "";
  const apiToken = process.env.NETLIFY_API_TOKEN || "";

  if (!siteID || !apiToken) {
    return new Response(
      JSON.stringify({ error: "NETLIFY_SITE_ID and NETLIFY_API_TOKEN env vars required for blob storage" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const redis = getRedisClient();

  try {
    // Check if already removed
    const alreadyRemoved = await redis.sismember("meta:removed_companies", boardToken);
    if (alreadyRemoved) {
      return new Response(
        JSON.stringify({ error: `Company '${boardToken}' was already archived and removed` }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      );
    }

    // Archive + purge Redis (works even if no job data exists yet)
    const result = await archiveAndRemoveCompany(redis, boardToken, siteID, apiToken);

    // Mark as removed so crawler and /api/companies skip it at runtime
    await redis.sadd("meta:removed_companies", boardToken);

    return new Response(
      JSON.stringify(
        {
          message: `Company '${boardToken}' archived to S3, purged from Redis, and removed from config`,
          removedFromConfig: true,
          ...result,
        },
        null,
        2,
      ),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error(`Error removing company ${boardToken}:`, error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  } finally {
    await disconnectRedis();
  }
};

export const config: Config = {
  path: "/api/companies/*",
  preferStatic: true,
};
