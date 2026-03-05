import type { Config } from "@netlify/functions";
import { getCrawlerRedis, disconnectCrawlerRedis } from "../../src/lib/crawler-redis.js";
import {
  addJob,
  addJobsBulk,
  removeJob,
  updateJobStatus,
  getJob,
  listJobs,
} from "../../src/lib/crawler-entities.js";
import type { Job } from "../../src/lib/crawler-types.js";

/**
 * /api/crawler/jobs
 *
 * GET              - List jobs (filters: ?board=, ?status=)
 * GET  ?board=&id= - Get single job
 * POST  { jobs: [...] } | { job_id, board, title, url, location, department }
 *                  - Add one or many jobs
 * PATCH { board, job_id, status } - Update job status (mark found/applied/etc.)
 * DELETE { board, job_id } - Remove a job
 */
export default async (req: Request) => {
  const r = getCrawlerRedis();

  try {
    const url = new URL(req.url);

    if (req.method === "GET") {
      const board = url.searchParams.get("board") || undefined;
      const status = url.searchParams.get("status") || undefined;
      const id = url.searchParams.get("id");

      if (board && id) {
        const job = await getJob(r, board, id);
        if (!job) return json({ error: "Job not found" }, 404);
        return json(job);
      }

      const jobs = await listJobs(r, { board, status });
      return json({ count: jobs.length, jobs });
    }

    if (req.method === "POST") {
      const body = await req.json();

      // Bulk add
      if (Array.isArray(body.jobs)) {
        const results = await addJobsBulk(r, body.jobs);
        return json({ count: results.length, jobs: results }, 201);
      }

      // Single add
      if (!body.job_id || !body.board) {
        return json({ error: "job_id and board are required" }, 400);
      }
      const job = await addJob(r, {
        job_id: body.job_id,
        board: body.board,
        title: body.title || "",
        url: body.url || "",
        location: body.location || "",
        department: body.department || "",
      });
      return json(job, 201);
    }

    if (req.method === "PATCH") {
      const body = await req.json();
      if (!body.board || !body.job_id || !body.status) {
        return json({ error: "board, job_id, and status are required" }, 400);
      }
      const validStatuses: Job["status"][] = ["discovered", "queued", "applied", "found", "rejected", "expired"];
      if (!validStatuses.includes(body.status)) {
        return json({ error: `status must be one of: ${validStatuses.join(", ")}` }, 400);
      }
      const updated = await updateJobStatus(r, body.board, body.job_id, body.status);
      if (!updated) return json({ error: "Job not found" }, 404);
      return json(updated);
    }

    if (req.method === "DELETE") {
      const body = await req.json();
      if (!body.board || !body.job_id) {
        return json({ error: "board and job_id are required" }, 400);
      }
      const removed = await removeJob(r, body.board, body.job_id);
      if (!removed) return json({ error: "Job not found" }, 404);
      return json({ success: true, board: body.board, job_id: body.job_id });
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (error: any) {
    console.error("crawler-jobs error:", error);
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
  path: "/api/crawler/jobs",
  method: ["GET", "POST", "PATCH", "DELETE"],
};
