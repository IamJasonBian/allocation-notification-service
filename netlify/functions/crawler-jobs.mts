import type { Config } from "@netlify/functions";
import { getRedisClient, disconnectRedis } from "../../src/lib/redis.js";
import { companies } from "../../src/config/companies.js";
import { fetchJobs } from "../../src/lib/job-fetcher.js";
import { diffAndUpdate } from "../../src/lib/differ.js";

/**
 * /api/crawler/jobs
 *   GET   — list/filter jobs or fetch runs
 *   PATCH — update job status
 *   POST  — trigger crawl (action: "retrieve")
 */
export default async (req: Request) => {
  const redis = getRedisClient();

  try {
    const url = new URL(req.url);

    if (req.method === "GET") {
      // If runs_for param present → return runs
      const runsFor = url.searchParams.get("runs_for");
      if (runsFor !== null) {
        return await handleGetRuns(redis, runsFor);
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

/** GET /api/crawler/jobs?status=X&board=Y&tag=Z */
async function handleGetJobs(redis: any, url: URL) {
  const statusFilter = url.searchParams.get("status");
  const boardFilter = url.searchParams.get("board");
  const tagFilter = url.searchParams.get("tag");

  // Determine which boards to scan
  let boardIds: string[];
  if (boardFilter) {
    boardIds = [boardFilter];
  } else {
    boardIds = await redis.smembers("idx:boards");
  }

  // Batch fetch: get all jobId sets in one pipeline
  const idPipe = redis.pipeline();
  for (const boardId of boardIds) {
    idPipe.smembers(`idx:board_jobs:${boardId}`);
  }
  const idResults = await idPipe.exec();

  // Build list of all job keys we need to fetch
  const jobEntries: { boardId: string; jobId: string; key: string }[] = [];
  for (let i = 0; i < boardIds.length; i++) {
    const [err, jobIds] = idResults[i] as [Error | null, string[]];
    if (err || !jobIds) continue;
    for (const jobId of jobIds) {
      jobEntries.push({
        boardId: boardIds[i],
        jobId,
        key: `job:${boardIds[i]}:${jobId}`,
      });
    }
  }

  // Batch fetch all job hashes in one pipeline
  const dataPipe = redis.pipeline();
  for (const entry of jobEntries) {
    dataPipe.hgetall(entry.key);
  }
  const dataResults = await dataPipe.exec();

  const allJobs: any[] = [];
  for (let i = 0; i < jobEntries.length; i++) {
    const [err, data] = dataResults[i] as [Error | null, Record<string, string>];
    if (err || !data || !data.job_id) continue;

    const tags = data.tags
      ? data.tags.split(",").map((t: string) => t.trim()).filter(Boolean)
      : [];

    if (statusFilter && data.status !== statusFilter) continue;
    if (tagFilter && !tags.includes(tagFilter)) continue;

    allJobs.push({
      job_id: data.job_id,
      board: data.board || jobEntries[i].boardId,
      title: data.title || "",
      url: data.url || "",
      location: data.location || "",
      department: data.department || "",
      tags,
      status: data.status || "discovered",
      discovered_at: data.discovered_at || data.updated_at || null,
      updated_at: data.updated_at || null,
    });
  }

  // Sort newest first
  allJobs.sort((a, b) => {
    const ta = a.discovered_at ? new Date(a.discovered_at).getTime() : 0;
    const tb = b.discovered_at ? new Date(b.discovered_at).getTime() : 0;
    return tb - ta;
  });

  return json(allJobs);
}

/** GET /api/crawler/jobs?runs_for= or ?runs_for=jobId */
async function handleGetRuns(redis: any, runsFor: string) {
  const runKeys = await redis.keys("run:*");
  const runs: any[] = [];

  for (const key of runKeys) {
    const data = await redis.hgetall(key);
    if (!data || !data.run_id) continue;

    // If runsFor is non-empty, filter by job_id
    if (runsFor && data.job_id !== runsFor) continue;

    let artifacts = null;
    if (data.artifacts) {
      try { artifacts = JSON.parse(data.artifacts); } catch { /* ignore */ }
    }

    runs.push({
      run_id: data.run_id,
      job_id: data.job_id || "",
      board: data.board || "",
      variant_id: data.variant_id || null,
      status: data.status || "pending",
      started_at: data.started_at || null,
      completed_at: data.completed_at || null,
      error: data.error || null,
      artifacts,
    });
  }

  runs.sort((a, b) => {
    const ta = a.started_at ? new Date(a.started_at).getTime() : 0;
    const tb = b.started_at ? new Date(b.started_at).getTime() : 0;
    return tb - ta;
  });

  return json(runs);
}

/** PATCH /api/crawler/jobs — body: { board, job_id, status } */
async function handlePatchJob(redis: any, req: Request) {
  const body = await req.json() as { board?: string; job_id?: string; status?: string };
  const { board, job_id, status } = body;

  if (!board || !job_id || !status) {
    return json({ error: "Missing board, job_id, or status" }, 400);
  }

  const hashKey = `job:${board}:${job_id}`;
  const exists = await redis.exists(hashKey);
  if (!exists) {
    return json({ error: `Job ${hashKey} not found` }, 404);
  }

  await redis.hset(hashKey, {
    status,
    updated_at: new Date().toISOString(),
  });

  return json({ ok: true, board, job_id, status });
}

/** POST /api/crawler/jobs — body: { action: "retrieve" } triggers crawl */
async function handlePostJobs(redis: any, req: Request) {
  const body = await req.json() as { action?: string };

  if (body.action !== "retrieve") {
    return json({ error: "Unknown action. Use { action: 'retrieve' }" }, 400);
  }

  // Filter out removed companies
  const removedSet = await redis.smembers("meta:removed_companies");
  const removedTokens = new Set(removedSet);
  const activeCompanies = companies.filter((c) => !removedTokens.has(c.boardToken));

  const results: any[] = [];

  for (const company of activeCompanies) {
    try {
      const apiJobs = await fetchJobs(company);
      if (apiJobs.length === 0) {
        results.push({ board: company.boardToken, jobs: 0, status: "empty" });
        continue;
      }

      // Ensure board exists in Redis
      const boardKey = `board:${company.boardToken}`;
      const boardExists = await redis.exists(boardKey);
      if (!boardExists) {
        await redis.hset(boardKey, {
          id: company.boardToken,
          company: company.displayName,
          ats: company.atsType || "greenhouse",
          created_at: new Date().toISOString(),
        });
        await redis.sadd("idx:boards", company.boardToken);
      }

      // Upsert jobs into production schema
      const pipe = redis.pipeline();
      let newCount = 0;

      for (const job of apiJobs) {
        const jobKey = `job:${company.boardToken}:${job.id}`;
        const existing = await redis.exists(jobKey);

        if (!existing) {
          newCount++;
          const tags = extractBasicTags(job.title, job.department);
          pipe.hset(jobKey, {
            job_id: job.id,
            board: company.boardToken,
            title: job.title,
            url: job.url,
            location: job.location,
            department: job.department,
            tags: tags.join(","),
            status: "discovered",
            discovered_at: new Date().toISOString(),
            updated_at: job.updated_at || new Date().toISOString(),
          });
          pipe.sadd(`idx:board_jobs:${company.boardToken}`, job.id);

          // Add to tag indexes
          for (const tag of tags) {
            pipe.sadd(`idx:tag:${tag}`, job.id);
          }
        }
      }

      await pipe.exec();
      results.push({ board: company.boardToken, jobs: apiJobs.length, new: newCount, status: "ok" });
    } catch (err: any) {
      results.push({ board: company.boardToken, jobs: 0, status: "error", error: err.message });
    }

    // Be polite to ATS APIs
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  return json({
    action: "retrieve",
    boards: results.length,
    results,
    timestamp: new Date().toISOString(),
  });
}

function extractBasicTags(title: string, department: string): string[] {
  const tags: string[] = [];
  const text = `${title} ${department}`.toLowerCase();

  if (/engineer|develop|software|swe/i.test(text)) tags.push("engineering");
  if (/data|analytics|scientist/i.test(text)) tags.push("data");
  if (/machine learn|ml |ai /i.test(text)) tags.push("ml");
  if (/research/i.test(text)) tags.push("research");
  if (/senior|staff|principal|lead/i.test(text)) tags.push("senior");
  if (/intern|co-?op/i.test(text)) tags.push("intern");
  if (/product\s*manag/i.test(text)) tags.push("product");
  if (/design|ux|ui/i.test(text)) tags.push("design");
  if (/quant|trading|risk|portfolio/i.test(text)) tags.push("quant");
  if (/finance|accounting|audit/i.test(text)) tags.push("finance");
  if (/analyst/i.test(text)) tags.push("analyst");
  if (/sales|business\s*develop/i.test(text)) tags.push("sales");
  if (/marketing|growth/i.test(text)) tags.push("marketing");
  if (/ops|operations|infra/i.test(text)) tags.push("ops");

  return tags;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const config: Config = {
  path: "/api/crawler/jobs",
};
