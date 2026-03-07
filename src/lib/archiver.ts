import type Redis from "ioredis";
import { getStore } from "@netlify/blobs";

export interface ArchiveResult {
  boardToken: string;
  archivedJobCount: number;
  deletedRedisKeys: number;
  blobKey: string;
  timestamp: string;
}

/**
 * Archives all job data for a company to Netlify Blobs,
 * then removes all related keys from Redis.
 */
export async function archiveAndRemoveCompany(
  redis: Redis,
  boardToken: string,
  siteID: string,
  token: string,
): Promise<ArchiveResult> {
  const now = new Date();
  const nowIso = now.toISOString();
  const blobKey = `archives/${boardToken}/${now.toISOString().slice(0, 10)}.json`;

  // 1. Collect all job data for the company
  const companyJobKeys = await redis.smembers(`idx:company:${boardToken}`);
  const jobs: Record<string, Record<string, string>> = {};

  for (const compositeKey of companyJobKeys) {
    const [, jobId] = compositeKey.split(":", 2);
    const hashKey = `jobs:${boardToken}:${jobId}`;
    const jobData = await redis.hgetall(hashKey);
    if (Object.keys(jobData).length > 0) {
      jobs[compositeKey] = jobData;
    }
  }

  // 2. Collect company stats and metadata
  const stats = await redis.hgetall(`stats:company:${boardToken}`);
  const lastFetch = await redis.get(`meta:last_fetch:${boardToken}`);

  const archive = {
    boardToken,
    archivedAt: nowIso,
    jobCount: Object.keys(jobs).length,
    stats,
    lastFetch,
    jobs,
  };

  // 3. Write to Netlify Blobs
  const store = getStore({ name: "job-archives", siteID, token });
  await store.setJSON(blobKey, archive);

  // 4. Delete all Redis keys for this company
  const pipe = redis.pipeline();
  let deletedKeys = 0;

  // Delete individual job hashes
  for (const compositeKey of companyJobKeys) {
    const [, jobId] = compositeKey.split(":", 2);
    const hashKey = `jobs:${boardToken}:${jobId}`;
    pipe.del(hashKey);
    deletedKeys++;

    // Remove from all index sets
    pipe.srem("idx:status:active", compositeKey);
    pipe.srem("idx:status:removed", compositeKey);

    // Remove from feed sorted sets
    pipe.zrem("feed:new", compositeKey);
    pipe.zrem("feed:removed", compositeKey);
    pipe.zrem(`feed:company:${boardToken}`, compositeKey);
  }

  // Delete company index set
  pipe.del(`idx:company:${boardToken}`);
  deletedKeys++;

  // Delete company stats and metadata
  pipe.del(`stats:company:${boardToken}`);
  pipe.del(`meta:last_fetch:${boardToken}`);
  pipe.srem("meta:companies", boardToken);
  deletedKeys += 3;

  // Clean up department and location indexes (scan for entries containing this boardToken)
  const deptKeys = await redis.keys("idx:dept:*");
  for (const key of deptKeys) {
    for (const compositeKey of companyJobKeys) {
      pipe.srem(key, compositeKey);
    }
  }

  const locKeys = await redis.keys("idx:location:*");
  for (const key of locKeys) {
    for (const compositeKey of companyJobKeys) {
      pipe.srem(key, compositeKey);
    }
  }

  const tagKeys = await redis.keys("idx:tag:*");
  for (const key of tagKeys) {
    for (const compositeKey of companyJobKeys) {
      pipe.srem(key, compositeKey);
    }
  }

  // Delete the company feed sorted set
  pipe.del(`feed:company:${boardToken}`);
  deletedKeys++;

  await pipe.exec();

  return {
    boardToken,
    archivedJobCount: Object.keys(jobs).length,
    deletedRedisKeys: deletedKeys,
    blobKey,
    timestamp: nowIso,
  };
}
