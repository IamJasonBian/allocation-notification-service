import type { Config } from "@netlify/functions";
import { getCrawlerRedis, disconnectCrawlerRedis } from "../../src/lib/crawler-redis.js";
import { createRun, updateRun, listRuns } from "../../src/lib/crawler-entities.js";
import type { JobRun } from "../../src/lib/crawler-types.js";

/**
 * /api/crawler/runs
 *
 * GET             - List all runs (?job_id= to filter by job)
 * POST { run_id, job_id, board, variant_id } - Create a new run
 * PATCH { run_id, status, error? } - Update run status
 */
export default async (req: Request) => {
  const r = getCrawlerRedis();

  try {
    const url = new URL(req.url);

    if (req.method === "GET") {
      const jobId = url.searchParams.get("job_id") || undefined;
      const runs = await listRuns(r, jobId);
      return json({ count: runs.length, runs });
    }

    if (req.method === "POST") {
      const body = await req.json();
      if (!body.run_id || !body.job_id || !body.board || !body.variant_id) {
        return json({ error: "run_id, job_id, board, and variant_id are required" }, 400);
      }
      const run = await createRun(r, {
        run_id: body.run_id,
        job_id: body.job_id,
        board: body.board,
        variant_id: body.variant_id,
      });
      return json(run, 201);
    }

    if (req.method === "PATCH") {
      const body = await req.json();
      if (!body.run_id || !body.status) {
        return json({ error: "run_id and status are required" }, 400);
      }
      const validStatuses: JobRun["status"][] = ["pending", "submitted", "success", "failed"];
      if (!validStatuses.includes(body.status)) {
        return json({ error: `status must be one of: ${validStatuses.join(", ")}` }, 400);
      }
      const updated = await updateRun(r, body.run_id, {
        status: body.status,
        error: body.error,
      });
      if (!updated) return json({ error: "Run not found" }, 404);
      return json(updated);
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (error: any) {
    console.error("crawler-runs error:", error);
    return json({ error: error.message }, 500);
  } finally {
    await disconnectCrawlerRedis();
  }
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const config: Config = {
  path: "/api/crawler/runs",
  method: ["GET", "POST", "PATCH"],
};
