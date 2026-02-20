import type { Config } from "@netlify/functions";
import { getRedisClient, disconnectRedis } from "../../src/lib/redis.js";

/**
 * GET /api/redis-debug
 * Debug endpoint to query Redis and return information about stored data
 */
export default async (req: Request) => {
  const redis = getRedisClient();

  try {
    const result: any = {
      connection: "success",
      data: {},
    };

    // Get database size
    const dbSize = await redis.dbsize();
    result.data.totalKeys = dbSize;

    // Get all keys
    const allKeys = await redis.keys("*");
    result.data.keyCount = allKeys.length;
    result.data.allKeys = allKeys;

    // Group keys by pattern
    const patterns: Record<string, number> = {};
    allKeys.forEach(key => {
      const prefix = key.split(":")[0];
      patterns[prefix] = (patterns[prefix] || 0) + 1;
    });
    result.data.patterns = patterns;

    // Sample data from different key types
    const samples: any[] = [];
    for (const key of allKeys.slice(0, 10)) {
      const type = await redis.type(key);
      const sample: any = { key, type };

      switch (type) {
        case "string":
          sample.value = await redis.get(key);
          break;
        case "hash":
          sample.value = await redis.hgetall(key);
          sample.fieldCount = Object.keys(sample.value).length;
          break;
        case "list":
          sample.length = await redis.llen(key);
          sample.value = await redis.lrange(key, 0, 4);
          break;
        case "set":
          sample.size = await redis.scard(key);
          sample.value = await redis.smembers(key);
          break;
        case "zset":
          sample.size = await redis.zcard(key);
          sample.value = await redis.zrange(key, 0, 4, "WITHSCORES");
          break;
      }

      samples.push(sample);
    }
    result.data.samples = samples;

    // Get application-specific data
    const appKeys = await redis.keys("application:*");
    result.data.applications = {
      count: appKeys.length,
      keys: appKeys.slice(0, 10),
    };

    if (appKeys.length > 0) {
      const sampleApp = await redis.hgetall(appKeys[0]);
      result.data.applications.sample = sampleApp;
    }

    // Get email verifications
    const emailKeys = await redis.keys("email_verification:*");
    result.data.emailVerifications = {
      count: emailKeys.length,
      keys: emailKeys.slice(0, 5),
    };

    // Get submissions
    const submissionKeys = await redis.keys("submission:*");
    result.data.submissions = {
      count: submissionKeys.length,
      keys: submissionKeys.slice(0, 5),
    };

    // Get status keys
    const statusKeys = await redis.keys("status:*");
    result.data.statuses = {
      count: statusKeys.length,
      keys: statusKeys,
    };

    if (statusKeys.length > 0) {
      const statusData = await redis.get(statusKeys[0]);
      result.data.statuses.sample = statusData;
    }

    // Get meta keys
    const metaKeys = await redis.keys("meta:*");
    result.data.meta = {
      count: metaKeys.length,
      keys: metaKeys.slice(0, 10),
    };

    // Get stats keys
    const statsKeys = await redis.keys("stats:*");
    result.data.stats = {
      count: statsKeys.length,
      keys: statsKeys.slice(0, 10),
    };

    if (statsKeys.length > 0) {
      const statsData = await redis.hgetall(statsKeys[0]);
      result.data.stats.sample = statsData;
    }

    return new Response(JSON.stringify(result, null, 2), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(
      JSON.stringify({
        error: error.message,
        stack: error.stack,
        connection: "failed",
      }, null, 2),
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
  path: "/api/redis-debug",
};
