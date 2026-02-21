import type { Config } from "@netlify/functions";
import { getRedisClient, disconnectRedis } from "../../src/lib/redis.js";

/**
 * GET /api/new-jobs
 * Returns recently indexed jobs from the feed:new sorted set.
 *
 * Query params:
 *   limit  - max results (default 50)
 *   hours  - look back N hours (default 24)
 *   company - filter by company boardToken (optional)
 *   tag    - filter by tag (optional)
 *   dept   - filter by department (optional)
 */
export default async (req: Request) => {
  const redis = getRedisClient();

  try {
    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get("limit") || "50", 10);
    const hours = parseInt(url.searchParams.get("hours") || "24", 10);
    const companyFilter = url.searchParams.get("company");
    const tagFilter = url.searchParams.get("tag");
    const deptFilter = url.searchParams.get("dept");

    // Calculate timestamp threshold (N hours ago)
    const thresholdTs = Date.now() / 1000 - hours * 3600;

    let compositeKeys: string[];

    if (companyFilter) {
      // Get new jobs for specific company
      compositeKeys = await redis.zrangebyscore(
        `feed:company:${companyFilter}`,
        thresholdTs,
        "+inf",
        "LIMIT",
        0,
        limit
      );
    } else {
      // Get all new jobs
      compositeKeys = await redis.zrangebyscore(
        "feed:new",
        thresholdTs,
        "+inf",
        "LIMIT",
        0,
        limit
      );
    }

    // Retrieve full job details
    const jobs = await Promise.all(
      compositeKeys.map(async (compositeKey) => {
        const [company, jobId] = compositeKey.split(":");
        const hashKey = `jobs:${company}:${jobId}`;
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

    // Filter out null results and apply optional filters
    let filteredJobs = jobs.filter((job) => job !== null);

    if (tagFilter) {
      filteredJobs = filteredJobs.filter((job) =>
        job!.tags.includes(tagFilter)
      );
    }

    if (deptFilter) {
      const normalizedDeptFilter = deptFilter.toLowerCase().replace(/\s+/g, "_");
      filteredJobs = filteredJobs.filter((job) => {
        const normalizedDept = job!.department.toLowerCase().replace(/\s+/g, "_");
        return normalizedDept.includes(normalizedDeptFilter);
      });
    }

    // Sort by firstSeenAt (most recent first)
    filteredJobs.sort((a, b) => {
      const aTime = new Date(a!.firstSeenAt).getTime();
      const bTime = new Date(b!.firstSeenAt).getTime();
      return bTime - aTime;
    });

    return new Response(
      JSON.stringify(
        {
          lookbackHours: hours,
          count: filteredJobs.length,
          filters: {
            company: companyFilter || null,
            tag: tagFilter || null,
            department: deptFilter || null,
          },
          jobs: filteredJobs.slice(0, limit),
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
    console.error("Error fetching new jobs:", error);
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
  path: "/api/new-jobs",
};
