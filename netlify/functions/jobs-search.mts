import type { Config } from "@netlify/functions";
import { getRedisClient, disconnectRedis } from "../../src/lib/redis.js";

/**
 * GET /api/jobs/search
 * Search and filter jobs by various criteria using Redis indexes.
 *
 * Query params:
 *   company   - filter by company boardToken (optional)
 *   tag       - filter by tag (e.g., "quantitative", "derivatives") (optional)
 *   dept      - filter by department (optional)
 *   location  - filter by location (optional)
 *   status    - filter by status (active|removed, default: active) (optional)
 *   limit     - max results (default 100)
 */
export default async (req: Request) => {
  const redis = getRedisClient();

  try {
    const url = new URL(req.url);
    const company = url.searchParams.get("company");
    const tag = url.searchParams.get("tag");
    const dept = url.searchParams.get("dept");
    const location = url.searchParams.get("location");
    const status = url.searchParams.get("status") || "active";
    const limit = parseInt(url.searchParams.get("limit") || "100", 10);

    // Build list of index keys to intersect
    const indexKeys: string[] = [];

    if (company) {
      indexKeys.push(`idx:company:${company}`);
    }

    if (tag) {
      indexKeys.push(`idx:tag:${tag}`);
    }

    if (dept) {
      const normalizedDept = dept.toLowerCase().replace(/\s+/g, "_");
      indexKeys.push(`idx:dept:${normalizedDept}`);
    }

    if (location) {
      const normalizedLoc = location.toLowerCase().replace(/\s+/g, "_");
      indexKeys.push(`idx:location:${normalizedLoc}`);
    }

    if (status) {
      indexKeys.push(`idx:status:${status}`);
    }

    // Get matching job keys
    let compositeKeys: string[];

    if (indexKeys.length === 0) {
      // No filters - get all active jobs
      compositeKeys = await redis.smembers("idx:status:active");
    } else if (indexKeys.length === 1) {
      // Single filter
      compositeKeys = await redis.smembers(indexKeys[0]);
    } else {
      // Multiple filters - intersect sets
      compositeKeys = await redis.sinter(...indexKeys);
    }

    // Limit results
    const limitedKeys = compositeKeys.slice(0, limit);

    // Retrieve full job details
    const jobs = await Promise.all(
      limitedKeys.map(async (compositeKey) => {
        const [companyCode, jobId] = compositeKey.split(":");
        const hashKey = `jobs:${companyCode}:${jobId}`;
        const jobData = await redis.hgetall(hashKey);

        if (Object.keys(jobData).length === 0) {
          return null;
        }

        return {
          id: jobData.job_id,
          company: jobData.company,
          companyName: jobData.company_name,
          title: jobData.title,
          url: jobData.url,
          location: jobData.location,
          department: jobData.department,
          tags: jobData.tags ? jobData.tags.split(",") : [],
          firstSeenAt: jobData.first_seen_at,
          lastSeenAt: jobData.last_seen_at,
          updatedAt: jobData.updated_at,
          status: jobData.status,
        };
      })
    );

    // Filter out null results
    const validJobs = jobs.filter((job) => job !== null);

    // Sort by firstSeenAt (most recent first)
    validJobs.sort((a, b) => {
      const aTime = new Date(a!.firstSeenAt).getTime();
      const bTime = new Date(b!.firstSeenAt).getTime();
      return bTime - aTime;
    });

    return new Response(
      JSON.stringify(
        {
          totalMatches: compositeKeys.length,
          count: validJobs.length,
          filters: {
            company: company || null,
            tag: tag || null,
            department: dept || null,
            location: location || null,
            status: status || "active",
          },
          jobs: validJobs,
        },
        null,
        2
      ),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error searching jobs:", error);
    return new Response(
      JSON.stringify({
        error: error.message,
        stack: error.stack,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  } finally {
    await disconnectRedis();
  }
};

export const config: Config = {
  path: "/api/jobs/search",
};
