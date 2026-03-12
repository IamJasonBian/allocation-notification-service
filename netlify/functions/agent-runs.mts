import type { Config } from "@netlify/functions";
import { randomUUID } from "crypto";
import { getRedisClient, disconnectRedis } from "../../src/lib/redis.js";
import {
  createAgentRun,
  getAgentRun,
  updateAgentRun,
  heartbeatAgentRun,
  listAgentRuns,
  getAgentRunsForJob,
  claimAgentRun,
  requeueAgentRun,
  reapStaleRuns,
  getQueueDepth,
  type AgentRunStatus,
} from "../../src/lib/agent-run-store.js";

/**
 * /api/agent-runs — Agent run queue for auto-apply workers
 *
 *   GET                          — list runs (newest first, limit 100)
 *   GET ?id=X                    — get single run by execution_id
 *   GET ?board=X&job_id=Y        — get runs for a specific job
 *   GET ?status=pending          — filter by status
 *   GET ?queue_depth=true        — get number of pending runs in queue
 *   POST                         — create run { job_id, board, resume_id }
 *   POST { action: "claim" }     — claim next pending run for a worker
 *   POST { action: "requeue" }   — requeue a failed run back to pending
 *   POST { action: "reap" }      — reap stale running jobs (no heartbeat)
 *   PATCH                        — update run { execution_id, status?, worker_id?, error?, artifacts? }
 *   PUT                          — heartbeat { execution_id, worker_id }
 */
export default async (req: Request) => {
  const redis = getRedisClient();

  try {
    const url = new URL(req.url);

    if (req.method === "GET") {
      return await handleGet(redis, url);
    }
    if (req.method === "POST") {
      return await handlePost(redis, req);
    }
    if (req.method === "PATCH") {
      return await handlePatch(redis, req);
    }
    if (req.method === "PUT") {
      return await handleHeartbeat(redis, req);
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (error: any) {
    console.error("Error in /api/agent-runs:", error);
    return json({ error: error.message }, 500);
  } finally {
    await disconnectRedis();
  }
};

async function handleGet(redis: any, url: URL) {
  // Queue depth check
  if (url.searchParams.get("queue_depth") === "true") {
    const depth = await getQueueDepth(redis);
    return json({ queue_depth: depth });
  }

  const id = url.searchParams.get("id");
  if (id) {
    const run = await getAgentRun(redis, id);
    if (!run) return json({ error: "Agent run not found" }, 404);
    return json(run);
  }

  const board = url.searchParams.get("board");
  const jobId = url.searchParams.get("job_id");
  if (board && jobId) {
    const runs = await getAgentRunsForJob(redis, board, jobId);
    return json({ count: runs.length, runs });
  }

  const status = url.searchParams.get("status") as AgentRunStatus | null;
  const limit = parseInt(url.searchParams.get("limit") || "100", 10);
  const runs = await listAgentRuns(redis, {
    status: status || undefined,
    limit,
  });
  return json({ count: runs.length, runs });
}

async function handlePost(redis: any, req: Request) {
  const body = await req.json() as {
    action?: string;
    job_id?: string;
    board?: string;
    resume_id?: string;
    worker_id?: string;
    execution_id?: string;
    timeout_ms?: number;
  };

  // ── Claim: agent picks up the next pending run ──
  if (body.action === "claim") {
    if (!body.worker_id) {
      return json({ error: "Missing worker_id" }, 400);
    }
    const run = await claimAgentRun(redis, body.worker_id);
    if (!run) {
      return json({ error: "No pending runs in queue" }, 204);
    }
    return json(run);
  }

  // ── Requeue: reset a failed/stale run back to pending ──
  if (body.action === "requeue") {
    if (!body.execution_id) {
      return json({ error: "Missing execution_id" }, 400);
    }
    const run = await requeueAgentRun(redis, body.execution_id);
    if (!run) return json({ error: "Agent run not found" }, 404);
    return json(run);
  }

  // ── Reap: find stale running jobs and requeue them ──
  if (body.action === "reap") {
    const timeoutMs = body.timeout_ms ?? 5 * 60 * 1000;
    const requeued = await reapStaleRuns(redis, timeoutMs);
    return json({ requeued: requeued.length, runs: requeued });
  }

  // ── Default: enqueue a new job for application ──
  if (!body.job_id || !body.board || !body.resume_id) {
    return json({ error: "Missing required fields: job_id, board, resume_id" }, 400);
  }

  const run = await createAgentRun(redis, {
    execution_id: randomUUID(),
    job_id: body.job_id,
    board: body.board,
    resume_id: body.resume_id,
  });

  return json(run, 201);
}

async function handlePatch(redis: any, req: Request) {
  const body = await req.json() as {
    execution_id?: string;
    status?: AgentRunStatus;
    worker_id?: string;
    error?: string;
    artifacts?: Record<string, unknown>;
  };

  if (!body.execution_id) {
    return json({ error: "Missing execution_id" }, 400);
  }

  const validStatuses: AgentRunStatus[] = ["pending", "running", "completed", "failed"];
  if (body.status && !validStatuses.includes(body.status)) {
    return json({ error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` }, 400);
  }

  const updated = await updateAgentRun(redis, body.execution_id, {
    status: body.status,
    worker_id: body.worker_id,
    error: body.error,
    artifacts: body.artifacts,
  });

  if (!updated) return json({ error: "Agent run not found" }, 404);
  return json(updated);
}

async function handleHeartbeat(redis: any, req: Request) {
  const body = await req.json() as {
    execution_id?: string;
    worker_id?: string;
  };

  if (!body.execution_id || !body.worker_id) {
    return json({ error: "Missing execution_id or worker_id" }, 400);
  }

  const updated = await heartbeatAgentRun(redis, body.execution_id, body.worker_id);
  if (!updated) return json({ error: "Agent run not found" }, 404);
  return json(updated);
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const config: Config = {
  path: "/api/agent-runs",
};
