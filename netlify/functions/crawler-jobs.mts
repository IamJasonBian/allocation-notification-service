import { getRedisClient, disconnectRedis } from "../../src/lib/redis.js";
import { companies } from "../../src/config/companies.js";
import { fetchJobs } from "../../src/lib/job-fetcher.js";
import { diffAndUpdate } from "../../src/lib/differ.js";
import { getAllActiveTags } from "../../src/lib/tag-store.js";
import { scoreJob } from "../../src/lib/relevance-scorer.js";
import type { RelevanceResult } from "../../src/lib/relevance-scorer.js";
import { randomUUID } from "crypto";

/**
 * /api/crawler/jobs
 *   GET   — list/filter jobs or fetch crawl runs
 *   PATCH — update job status
 *   POST  — trigger crawl (action: "retrieve")
 */
export default async (req: Request) => {
  const redis = getRedisClient();

  try {
    const url = new URL(req.url);

    if (req.method === "GET") {
      const runsFor = url.searchParams.get("runs_for");
      if (runsFor !== null) {
        return await handleGetRuns(redis);
      }
      return await handleGetJobs(redis, url);
    }

    if (req.method === "PATCH") {
      return await handlePatchJob(redis, req);
    }

    if (req.method === "POST") {
      return await handlePostJobs(redis, req);
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (error: any) {
    console.error("Error in /api/crawler/jobs:", error);
    return json({ error: error.message }, 500);
  } finally {
    await disconnectRedis();
  }
};

/** GET /api/crawler/jobs?status=X&board=Y&tag=Z — reads from new schema */
async function handleGetJobs(redis: any, url: URL) {
  const statusFilter = url.searchParams.get("status");
  const boardFilter = url.searchParams.get("board");
  const tagFilter = url.searchParams.get("tag");

  // Read from new schema: meta:companies has board tokens
  let boardTokens: string[];
  if (boardFilter) {
    boardTokens = [boardFilter];
  } else {
    boardTokens = await redis.smembers("meta:companies");
  }

  // Get composite keys (boardToken:jobId) from idx:company:{token}
  const idPipe = redis.pipeline();
  for (const token of boardTokens) {
    idPipe.smembers(`idx:company:${token}`);
  }
  const idResults = await idPipe.exec();

  const compositeKeys: string[] = [];
  for (let i = 0; i < boardTokens.length; i++) {
    const [err, keys] = idResults[i] as [Error | null, string[]];
    if (err || !keys) continue;
    compositeKeys.push(...keys);
  }

  // Optionally filter by status index before fetching hashes
  let keysToFetch = compositeKeys;
  if (statusFilter) {
    const statusMembers = await redis.smembers(`idx:status:${statusFilter}`);
    const statusSet = new Set(statusMembers);
    keysToFetch = compositeKeys.filter((k) => statusSet.has(k));
  }

  // Optionally filter by tag index
  if (tagFilter) {
    const tagMembers = await redis.smembers(`idx:tag:${tagFilter}`);
    const tagSet = new Set(tagMembers);
    keysToFetch = keysToFetch.filter((k) => tagSet.has(k));
  }

  // Batch fetch job hashes: jobs:{boardToken}:{jobId}
  const dataPipe = redis.pipeline();
  for (const ck of keysToFetch) {
    const [board, ...idParts] = ck.split(":");
    const jobId = idParts.join(":");
    dataPipe.hgetall(`jobs:${board}:${jobId}`);
  }
  const dataResults = await dataPipe.exec();

  const allJobs: any[] = [];
  for (let i = 0; i < keysToFetch.length; i++) {
    const [err, data] = dataResults[i] as [Error | null, Record<string, string>];
    if (err || !data || !data.job_id) continue;

    const tags = data.tags
      ? data.tags.split(",").map((t: string) => t.trim()).filter(Boolean)
      : [];

    allJobs.push({
      job_id: data.job_id,
      board: data.company || keysToFetch[i].split(":")[0],
      title: data.title || "",
      url: data.url || "",
      location: data.location || "",
      department: data.department || "",
      tags,
      status: data.status || "active",
      discovered_at: data.first_seen_at || data.last_seen_at || null,
      updated_at: data.updated_at || null,
    });
  }

  allJobs.sort((a, b) => {
    const ta = a.discovered_at ? new Date(a.discovered_at).getTime() : 0;
    const tb = b.discovered_at ? new Date(b.discovered_at).getTime() : 0;
    return tb - ta;
  });

  return json({ count: allJobs.length, jobs: allJobs });
}

/** GET /api/crawler/jobs?runs_for= → return crawl run history */
async function handleGetRuns(redis: any) {
  const runIds = await redis.zrevrange("idx:crawl_runs", 0, 99);

  if (runIds.length === 0) {
    return json([]);
  }

  const pipe = redis.pipeline();
  for (const id of runIds) {
    pipe.hgetall(`crawl_run:${id}`);
  }
  const results = await pipe.exec();

  const runs: any[] = [];
  for (let i = 0; i < results.length; i++) {
    const [err, data] = results[i] as [Error | null, Record<string, string>];
    if (err || !data || !data.run_id) continue;

    runs.push({
      run_id: data.run_id,
      started_at: data.started_at || null,
      completed_at: data.completed_at || null,
      status: data.status || "unknown",
      trigger: data.trigger || "unknown",
      boards_total: parseInt(data.boards_total || "0"),
      boards_ok: parseInt(data.boards_ok || "0"),
      boards_error: parseInt(data.boards_error || "0"),
      jobs_fetched: parseInt(data.jobs_fetched || "0"),
      jobs_relevant: parseInt(data.jobs_relevant || "0"),
      jobs_new: parseInt(data.jobs_new || "0"),
      jobs_updated: parseInt(data.jobs_updated || "0"),
      jobs_removed: parseInt(data.jobs_removed || "0"),
      jobs_unchanged: parseInt(data.jobs_unchanged || "0"),
      duration_ms: parseInt(data.duration_ms || "0"),
      error: data.error || null,
    });
  }

  return json(runs);
}

/** PATCH /api/crawler/jobs — body: { board, job_id, status } */
async function handlePatchJob(redis: any, req: Request) {
  const body = await req.json() as { board?: string; job_id?: string; status?: string };
  const { board, job_id, status } = body;

  if (!board || !job_id || !status) {
    return json({ error: "Missing board, job_id, or status" }, 400);
  }

  const validStatuses = ["active", "removed", "applying", "applied"];
  if (!validStatuses.includes(status)) {
    return json({ error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` }, 400);
  }

  const hashKey = `jobs:${board}:${job_id}`;
  const exists = await redis.exists(hashKey);
  if (!exists) {
    return json({ error: `Job ${hashKey} not found` }, 404);
  }

  const oldStatus = await redis.hget(hashKey, "status");
  const compositeKey = `${board}:${job_id}`;

  const pipe = redis.pipeline();
  pipe.hset(hashKey, { status, updated_at: new Date().toISOString() });

  if (oldStatus && oldStatus !== status) {
    pipe.srem(`idx:status:${oldStatus}`, compositeKey);
  }
  pipe.sadd(`idx:status:${status}`, compositeKey);

  await pipe.exec();

  return json({ ok: true, board, job_id, status });
}

/** POST /api/crawler/jobs — body: { action: "retrieve" } triggers crawl */
async function handlePostJobs(redis: any, req: Request) {
  const body = await req.json() as { action?: string };

  if (body.action !== "retrieve") {
    return json({ error: "Unknown action. Use { action: 'retrieve' }" }, 400);
  }

  // Create crawl run record
  const runId = randomUUID();
  const startTime = Date.now();
  const startIso = new Date(startTime).toISOString();

  await redis.hset(`crawl_run:${runId}`, {
    run_id: runId,
    started_at: startIso,
    status: "running",
    trigger: "manual",
  });
  await redis.zadd("idx:crawl_runs", String(startTime / 1000), runId);

  // Filter out removed companies
  const removedSet = await redis.smembers("meta:removed_companies");
  const removedTokens = new Set(removedSet);
  const activeCompanies = companies.filter((c) => !removedTokens.has(c.boardToken));

  // Load relevance filter tags
  const activeTags = await getAllActiveTags(redis);
  const scoringEnabled = activeTags.length > 0;

  const results: any[] = [];
  let totalFetched = 0, totalRelevant = 0, totalNew = 0;
  let totalUpdated = 0, totalRemoved = 0, totalUnchanged = 0;
  let boardsOk = 0, boardsError = 0;

  for (const company of activeCompanies) {
    try {
      const apiJobs = await fetchJobs(company);
      if (apiJobs.length === 0) {
        results.push({ board: company.boardToken, jobs: 0, status: "empty" });
        boardsOk++;
        continue;
      }

      let jobsToStore = apiJobs;
      let scoredMap: Map<string, RelevanceResult> | undefined;
      if (scoringEnabled) {
        scoredMap = new Map();
        jobsToStore = apiJobs.filter((job) => {
          const result = scoreJob(job, activeTags);
          scoredMap!.set(job.id, result);
          return result.relevant;
        });
      }

      const { stats } = await diffAndUpdate(redis, company, jobsToStore, scoredMap);

      totalFetched += apiJobs.length;
      totalRelevant += jobsToStore.length;
      totalNew += stats.newCount;
      totalUpdated += stats.updatedCount;
      totalRemoved += stats.removedCount;
      totalUnchanged += stats.unchangedCount;
      boardsOk++;

      results.push({
        board: company.boardToken,
        fetched: apiJobs.length,
        relevant: jobsToStore.length,
        filtered: apiJobs.length - jobsToStore.length,
        new: stats.newCount,
        updated: stats.updatedCount,
        removed: stats.removedCount,
        status: "ok",
      });
    } catch (err: any) {
      boardsError++;
      results.push({ board: company.boardToken, jobs: 0, status: "error", error: err.message });
    }

    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  // Finalize crawl run
  const endTime = Date.now();
  await redis.hset(`crawl_run:${runId}`, {
    completed_at: new Date(endTime).toISOString(),
    status: "completed",
    boards_total: String(activeCompanies.length),
    boards_ok: String(boardsOk),
    boards_error: String(boardsError),
    jobs_fetched: String(totalFetched),
    jobs_relevant: String(totalRelevant),
    jobs_new: String(totalNew),
    jobs_updated: String(totalUpdated),
    jobs_removed: String(totalRemoved),
    jobs_unchanged: String(totalUnchanged),
    duration_ms: String(endTime - startTime),
  });

  return json({
    action: "retrieve",
    run_id: runId,
    boards: results.length,
    results,
    timestamp: new Date().toISOString(),
  });
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
