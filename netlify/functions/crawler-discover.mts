import type { Config } from "@netlify/functions";
import { getCrawlerRedis, disconnectCrawlerRedis } from "../../src/lib/crawler-redis.js";
import { listBoards, listJobs, removeJob } from "../../src/lib/crawler-entities.js";

/**
 * /api/crawler/discover
 *
 * POST { action: "notify" }
 *   - Collect discovered/queued jobs, send summary to Slack webhook, return results
 *
 * POST { action: "cleanup", board?, status? }
 *   - Remove jobs matching filters (e.g., remove expired/applied jobs)
 *
 * POST { action: "retrieve", board?, status? }
 *   - Retrieve job_ids ready for allocation-agent to apply (default status: "discovered")
 */
export default async (req: Request) => {
  const r = getCrawlerRedis();

  try {
    const body = await req.json();
    const action = body.action;

    if (action === "notify") {
      const jobs = await listJobs(r, { status: body.status || "discovered" });
      if (jobs.length === 0) {
        return json({ message: "No jobs to notify", count: 0 });
      }

      // Group by board
      const grouped: Record<string, typeof jobs> = {};
      for (const job of jobs) {
        (grouped[job.board] ??= []).push(job);
      }

      const blocks: object[] = [
        {
          type: "header",
          text: { type: "plain_text", text: `Crawler: ${jobs.length} Job(s) Discovered` },
        },
      ];

      for (const [board, boardJobs] of Object.entries(grouped)) {
        blocks.push({
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*${board}* (${boardJobs.length} jobs)`,
          },
        });
        for (const job of boardJobs.slice(0, 10)) {
          blocks.push({
            type: "section",
            text: {
              type: "mrkdwn",
              text: `• <${job.url}|${job.title}> — ${job.location} / ${job.department}`,
            },
          });
        }
        if (boardJobs.length > 10) {
          blocks.push({
            type: "context",
            elements: [{ type: "mrkdwn", text: `...and ${boardJobs.length - 10} more from ${board}` }],
          });
        }
      }

      const webhookUrl = process.env.SLACK_WEBHOOK_URL;
      if (webhookUrl) {
        const resp = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ blocks }),
        });
        if (!resp.ok) {
          console.error(`Slack webhook failed (${resp.status}): ${await resp.text()}`);
        }
      }

      return json({ message: "Notification sent", count: jobs.length, boards: Object.keys(grouped) });
    }

    if (action === "cleanup") {
      const jobs = await listJobs(r, {
        board: body.board,
        status: body.status || "applied",
      });
      let removed = 0;
      for (const job of jobs) {
        await removeJob(r, job.board, job.job_id);
        removed++;
      }
      return json({ message: "Cleanup complete", removed });
    }

    if (action === "retrieve") {
      const jobs = await listJobs(r, {
        board: body.board,
        status: body.status || "discovered",
      });
      return json({
        count: jobs.length,
        jobs: jobs.map((j) => ({
          job_id: j.job_id,
          board: j.board,
          title: j.title,
          url: j.url,
          location: j.location,
          department: j.department,
          status: j.status,
        })),
      });
    }

    return json({ error: "action must be one of: notify, cleanup, retrieve" }, 400);
  } catch (error: any) {
    console.error("crawler-discover error:", error);
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
  path: "/api/crawler/discover",
  method: ["POST"],
};
