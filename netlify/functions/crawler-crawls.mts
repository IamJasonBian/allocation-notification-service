import type { Config } from "@netlify/functions";
import { getRedisClient, disconnectRedis } from "../../src/lib/redis.js";

/**
 * /api/crawler/crawls
 *   GET   — list crawls or fetch single by ?id=
 *   POST  — create a crawl record
 *   PATCH — update a crawl record
 */
export default async (req: Request) => {
  const redis = getRedisClient();

  try {
    const url = new URL(req.url);

    if (req.method === "GET") {
      return await handleGetCrawls(redis, url);
    }

    if (req.method === "POST") {
      return await handlePostCrawl(redis, req);
    }

    if (req.method === "PATCH") {
      return await handlePatchCrawl(redis, req);
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (error: any) {
    console.error("Error in /api/crawler/crawls:", error);
    return json({ error: error.message }, 500);
  } finally {
    await disconnectRedis();
  }
};

/** GET /api/crawler/crawls or /api/crawler/crawls?id=crawl-xxx */
async function handleGetCrawls(redis: any, url: URL) {
  const id = url.searchParams.get("id");

  if (id) {
    const data = await redis.hgetall(`crawl_exec:${id}`);
    if (!data || !data.crawl_id) {
      return json({ error: `Crawl ${id} not found` }, 404);
    }

    let stats = null;
    if (data.stats) {
      try { stats = JSON.parse(data.stats); } catch { /* ignore */ }
    }

    return json({
      crawl_id: data.crawl_id,
      status: data.status,
      trigger: data.trigger,
      started_at: data.started_at || null,
      completed_at: data.completed_at || null,
      error: data.error || null,
      stats,
    });
  }

  // List all crawls
  const crawlIds = await redis.smembers("idx:crawls");
  const crawls: any[] = [];

  if (crawlIds.length > 0) {
    const pipe = redis.pipeline();
    for (const crawlId of crawlIds) {
      pipe.hgetall(`crawl_exec:${crawlId}`);
    }
    const results = await pipe.exec();

    for (let i = 0; i < crawlIds.length; i++) {
      const [err, data] = results[i] as [Error | null, Record<string, string>];
      if (err || !data || !data.crawl_id) continue;

      let stats = null;
      if (data.stats) {
        try { stats = JSON.parse(data.stats); } catch { /* ignore */ }
      }

      crawls.push({
        crawl_id: data.crawl_id,
        status: data.status,
        trigger: data.trigger,
        started_at: data.started_at || null,
        completed_at: data.completed_at || null,
        error: data.error || null,
        stats,
      });
    }
  }

  // Sort newest first
  crawls.sort((a, b) => {
    const ta = a.started_at ? new Date(a.started_at).getTime() : 0;
    const tb = b.started_at ? new Date(b.started_at).getTime() : 0;
    return tb - ta;
  });

  return json(crawls);
}

/** POST /api/crawler/crawls — body: { trigger: "manual" | "scheduled" } */
async function handlePostCrawl(redis: any, req: Request) {
  const body = await req.json() as { trigger?: string };
  const trigger = body.trigger || "manual";

  if (trigger !== "manual" && trigger !== "scheduled") {
    return json({ error: "trigger must be 'manual' or 'scheduled'" }, 400);
  }

  const crawlId = `crawl-${Date.now()}`;
  const now = new Date().toISOString();

  await redis.hset(`crawl_exec:${crawlId}`, {
    crawl_id: crawlId,
    status: "pending",
    trigger,
    started_at: now,
    completed_at: "",
    error: "",
    stats: "",
  });
  await redis.sadd("idx:crawls", crawlId);

  return json({ ok: true, crawl_id: crawlId, status: "pending", trigger });
}

/** PATCH /api/crawler/crawls — body: { crawl_id, status, error?, stats? } */
async function handlePatchCrawl(redis: any, req: Request) {
  const body = await req.json() as {
    crawl_id?: string;
    status?: string;
    error?: string;
    stats?: any;
  };

  const { crawl_id, status, error, stats } = body;

  if (!crawl_id || !status) {
    return json({ error: "Missing crawl_id or status" }, 400);
  }

  const hashKey = `crawl_exec:${crawl_id}`;
  const exists = await redis.exists(hashKey);
  if (!exists) {
    return json({ error: `Crawl ${crawl_id} not found` }, 404);
  }

  const updates: Record<string, string> = { status };

  if (status === "success" || status === "failed") {
    updates.completed_at = new Date().toISOString();
  }

  if (error !== undefined) {
    updates.error = error;
  }

  if (stats !== undefined) {
    updates.stats = typeof stats === "string" ? stats : JSON.stringify(stats);
  }

  await redis.hset(hashKey, updates);

  return json({ ok: true, crawl_id, status });
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const config: Config = {
  path: "/api/crawler/crawls",
};
