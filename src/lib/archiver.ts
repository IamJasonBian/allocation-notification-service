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
 *
 * Handles both production schema (`job:`, `board:`, `idx:board_jobs:`)
 * and newer schema (`jobs:`, `idx:company:`, `stats:company:`).
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

  // 1. Collect job data from both key schemas
  const jobs: Record<string, Record<string, string>> = {};

  // Production schema: idx:board_jobs:{token} → set of jobIds, keys are job:{token}:{id}
  const prodJobIds = await redis.smembers(`idx:board_jobs:${boardToken}`);
  for (const jobId of prodJobIds) {
    const hashKey = `job:${boardToken}:${jobId}`;
    const jobData = await redis.hgetall(hashKey);
    if (Object.keys(jobData).length > 0) {
      jobs[hashKey] = jobData;
    }
  }

  // Newer schema: idx:company:{token} → set of compositeKeys, keys are jobs:{token}:{id}
  const newSchemaKeys = await redis.smembers(`idx:company:${boardToken}`);
  for (const compositeKey of newSchemaKeys) {
    const [, jobId] = compositeKey.split(":", 2);
    const hashKey = `jobs:${boardToken}:${jobId}`;
    const jobData = await redis.hgetall(hashKey);
    if (Object.keys(jobData).length > 0) {
      jobs[hashKey] = jobData;
    }
  }

  // 2. Collect company metadata from both schemas
  const boardMeta = await redis.hgetall(`board:${boardToken}`);
  const stats = await redis.hgetall(`stats:company:${boardToken}`);
  const lastFetch = await redis.get(`meta:last_fetch:${boardToken}`);

  const archive = {
    boardToken,
    archivedAt: nowIso,
    jobCount: Object.keys(jobs).length,
    boardMeta,
    stats,
    lastFetch,
    jobs,
  };

  // 3. Write to Netlify Blobs (skip if credentials unavailable)
  let blobWritten = false;
  if (siteID && token) {
    const store = getStore({ name: "job-archives", siteID, token });
    await store.setJSON(blobKey, archive);
    blobWritten = true;
  }

  // 4. Delete all Redis keys for this company
  const pipe = redis.pipeline();
  let deletedKeys = 0;

  // Delete production-schema job hashes + clean indexes
  for (const jobId of prodJobIds) {
    const hashKey = `job:${boardToken}:${jobId}`;
    pipe.del(hashKey);
    deletedKeys++;
  }

  // Delete newer-schema job hashes + clean indexes
  for (const compositeKey of newSchemaKeys) {
    const [, jobId] = compositeKey.split(":", 2);
    pipe.del(`jobs:${boardToken}:${jobId}`);
    deletedKeys++;

    pipe.srem("idx:status:active", compositeKey);
    pipe.srem("idx:status:removed", compositeKey);
    pipe.zrem("feed:new", compositeKey);
    pipe.zrem("feed:removed", compositeKey);
    pipe.zrem(`feed:company:${boardToken}`, compositeKey);
  }

  // Delete production-schema company keys
  pipe.del(`board:${boardToken}`);
  pipe.del(`idx:board_jobs:${boardToken}`);
  pipe.srem("idx:boards", boardToken);
  deletedKeys += 3;

  // Delete newer-schema company keys
  pipe.del(`idx:company:${boardToken}`);
  pipe.del(`stats:company:${boardToken}`);
  pipe.del(`meta:last_fetch:${boardToken}`);
  pipe.srem("meta:companies", boardToken);
  pipe.del(`feed:company:${boardToken}`);
  deletedKeys += 5;

  // Clean up tag indexes (both schemas store jobIds in idx:tag:*)
  const tagKeys = await redis.keys("idx:tag:*");
  for (const key of tagKeys) {
    // Production schema uses raw jobIds
    for (const jobId of prodJobIds) {
      pipe.srem(key, jobId);
    }
    // Newer schema uses compositeKeys
    for (const compositeKey of newSchemaKeys) {
      pipe.srem(key, compositeKey);
    }
  }

  // Clean up dept/location indexes (newer schema only)
  const deptKeys = await redis.keys("idx:dept:*");
  for (const key of deptKeys) {
    for (const compositeKey of newSchemaKeys) {
      pipe.srem(key, compositeKey);
    }
  }
  const locKeys = await redis.keys("idx:location:*");
  for (const key of locKeys) {
    for (const compositeKey of newSchemaKeys) {
      pipe.srem(key, compositeKey);
    }
  }

  await pipe.exec();

  return {
    boardToken,
    archivedJobCount: Object.keys(jobs).length,
    deletedRedisKeys: deletedKeys,
    blobKey: blobWritten ? blobKey : "(skipped — no NETLIFY_SITE_ID/TOKEN)",
    timestamp: nowIso,
  };
}
