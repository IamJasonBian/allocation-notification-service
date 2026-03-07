import type { Config } from "@netlify/functions";
import { getRedisClient, disconnectRedis } from "../../src/lib/redis.js";

/**
 * /api/redis/job?company=<boardToken>&id=<jobId>
 *   GET    — fetch a single job hash from Redis
 *   DELETE — delete a single job + clean up all indexes
 */
export default async (req: Request) => {
  const redis = getRedisClient();

  try {
    const url = new URL(req.url);
    const company = url.searchParams.get("company");
    const jobId = url.searchParams.get("id");

    if (!company || !jobId) {
      return json({ error: "Missing ?company= and ?id= parameters" }, 400);
    }

    const hashKey = `jobs:${company}:${jobId}`;
    const compositeKey = `${company}:${jobId}`;

    if (req.method === "DELETE") {
      // Get job data before deleting (for index cleanup)
      const jobData = await redis.hgetall(hashKey);
      if (Object.keys(jobData).length === 0) {
        return json({ error: `Job '${hashKey}' not found` }, 404);
      }

      const pipe = redis.pipeline();

      // Delete the hash
      pipe.del(hashKey);

      // Remove from all index sets
      pipe.srem(`idx:company:${company}`, compositeKey);
      pipe.srem("idx:status:active", compositeKey);
      pipe.srem("idx:status:removed", compositeKey);

      // Remove from feeds
      pipe.zrem("feed:new", compositeKey);
      pipe.zrem("feed:removed", compositeKey);
      pipe.zrem(`feed:company:${company}`, compositeKey);

      // Remove from dept/location/tag indexes
      if (jobData.department) {
        const normDept = jobData.department.toLowerCase().replace(/\s+/g, "_").replace(/&/g, "and");
        pipe.srem(`idx:dept:${normDept}`, compositeKey);
      }
      if (jobData.location) {
        const normLoc = jobData.location.toLowerCase().replace(/\s+/g, "_");
        pipe.srem(`idx:location:${normLoc}`, compositeKey);
      }
      if (jobData.tags) {
        for (const tag of jobData.tags.split(",").filter(Boolean)) {
          pipe.srem(`idx:tag:${tag}`, compositeKey);
        }
      }

      await pipe.exec();

      return json({
        deleted: true,
        key: hashKey,
        title: jobData.title,
        company: jobData.company_name,
      });
    }

    // GET — fetch job
    const jobData = await redis.hgetall(hashKey);
    if (Object.keys(jobData).length === 0) {
      return json({ error: `Job '${hashKey}' not found` }, 404);
    }

    return json({
      key: hashKey,
      ...jobData,
      tags: jobData.tags ? jobData.tags.split(",") : [],
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
  path: "/api/redis/job",
};
