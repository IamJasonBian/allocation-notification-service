import type Redis from "ioredis";

export type AgentRunStatus = "pending" | "running" | "completed" | "failed";

export interface AgentRun {
  execution_id: string;
  job_id: string;
  board: string;
  resume_id: string;
  status: AgentRunStatus;
  attempt: number;
  worker_id: string | null;
  heartbeat_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  error: string | null;
  artifacts: Record<string, unknown> | null;
}

const VALID_STATUSES: AgentRunStatus[] = ["pending", "running", "completed", "failed"];

function toRedisHash(run: AgentRun): Record<string, string> {
  return {
    execution_id: run.execution_id,
    job_id: run.job_id,
    board: run.board,
    resume_id: run.resume_id,
    status: run.status,
    attempt: String(run.attempt),
    worker_id: run.worker_id || "",
    heartbeat_at: run.heartbeat_at || "",
    started_at: run.started_at || "",
    completed_at: run.completed_at || "",
    created_at: run.created_at,
    updated_at: run.updated_at,
    error: run.error || "",
    artifacts: run.artifacts ? JSON.stringify(run.artifacts) : "",
  };
}

function fromRedisHash(data: Record<string, string>): AgentRun | null {
  if (!data || !data.execution_id) return null;
  return {
    execution_id: data.execution_id,
    job_id: data.job_id || "",
    board: data.board || "",
    resume_id: data.resume_id || "",
    status: (VALID_STATUSES.includes(data.status as AgentRunStatus) ? data.status : "pending") as AgentRunStatus,
    attempt: parseInt(data.attempt) || 1,
    worker_id: data.worker_id || null,
    heartbeat_at: data.heartbeat_at || null,
    started_at: data.started_at || null,
    completed_at: data.completed_at || null,
    created_at: data.created_at || "",
    updated_at: data.updated_at || "",
    error: data.error || null,
    artifacts: safeParse(data.artifacts, null),
  };
}

function safeParse(val: string | undefined, fallback: any): any {
  if (!val) return fallback;
  try { return JSON.parse(val); } catch { return fallback; }
}

/**
 * Create a new agent run for a job application attempt.
 */
export async function createAgentRun(
  r: Redis,
  input: { execution_id: string; job_id: string; board: string; resume_id: string },
): Promise<AgentRun> {
  const now = new Date().toISOString();

  // Check how many existing runs for this job to determine attempt number
  const existingIds = await r.smembers(`idx:agent_runs:job:${input.board}:${input.job_id}`);
  const attempt = existingIds.length + 1;

  const run: AgentRun = {
    execution_id: input.execution_id,
    job_id: input.job_id,
    board: input.board,
    resume_id: input.resume_id,
    status: "pending",
    attempt,
    worker_id: null,
    heartbeat_at: null,
    started_at: null,
    completed_at: null,
    created_at: now,
    updated_at: now,
    error: null,
    artifacts: null,
  };

  const pipe = r.pipeline();
  pipe.hset(`agent_run:${run.execution_id}`, toRedisHash(run));
  pipe.zadd("idx:agent_runs", String(Date.now()), run.execution_id);
  pipe.sadd(`idx:agent_runs:job:${input.board}:${input.job_id}`, run.execution_id);
  pipe.sadd("idx:agent_runs:status:pending", run.execution_id);
  // Add to FIFO queue (score = timestamp for oldest-first)
  pipe.zadd("queue:agent_runs", String(Date.now()), run.execution_id);
  await pipe.exec();

  return run;
}

/**
 * Get a single agent run by execution_id.
 */
export async function getAgentRun(r: Redis, executionId: string): Promise<AgentRun | null> {
  const data = await r.hgetall(`agent_run:${executionId}`);
  return fromRedisHash(data);
}

/**
 * Update an agent run's status and optional fields.
 */
export async function updateAgentRun(
  r: Redis,
  executionId: string,
  updates: {
    status?: AgentRunStatus;
    worker_id?: string;
    error?: string;
    artifacts?: Record<string, unknown>;
  },
): Promise<AgentRun | null> {
  const existing = await getAgentRun(r, executionId);
  if (!existing) return null;

  const now = new Date().toISOString();
  const updated: AgentRun = { ...existing, updated_at: now };

  if (updates.status !== undefined) {
    updated.status = updates.status;
    if (updates.status === "running" && !existing.started_at) {
      updated.started_at = now;
    }
    if (updates.status === "completed" || updates.status === "failed") {
      updated.completed_at = now;
    }
  }
  if (updates.worker_id !== undefined) updated.worker_id = updates.worker_id;
  if (updates.error !== undefined) updated.error = updates.error;
  if (updates.artifacts !== undefined) updated.artifacts = updates.artifacts;

  const pipe = r.pipeline();
  pipe.hset(`agent_run:${executionId}`, toRedisHash(updated));

  // Update status indexes if status changed
  if (updates.status && updates.status !== existing.status) {
    pipe.srem(`idx:agent_runs:status:${existing.status}`, executionId);
    pipe.sadd(`idx:agent_runs:status:${updates.status}`, executionId);
  }
  await pipe.exec();

  return updated;
}

/**
 * Record a heartbeat from a worker.
 */
export async function heartbeatAgentRun(
  r: Redis,
  executionId: string,
  workerId: string,
): Promise<AgentRun | null> {
  const existing = await getAgentRun(r, executionId);
  if (!existing) return null;

  const now = new Date().toISOString();
  const updated: AgentRun = {
    ...existing,
    heartbeat_at: now,
    worker_id: workerId,
    updated_at: now,
  };

  await r.hset(`agent_run:${executionId}`, toRedisHash(updated));
  return updated;
}

/**
 * List agent runs, newest first. Optional status filter.
 */
export async function listAgentRuns(
  r: Redis,
  opts?: { status?: AgentRunStatus; limit?: number },
): Promise<AgentRun[]> {
  const limit = opts?.limit ?? 100;

  let ids: string[];
  if (opts?.status) {
    // Get IDs from status index, then sort by creation time
    const statusIds = await r.smembers(`idx:agent_runs:status:${opts.status}`);
    // Intersect with sorted set to get ordering
    ids = statusIds.slice(0, limit);
  } else {
    ids = await r.zrevrange("idx:agent_runs", 0, limit - 1);
  }

  if (ids.length === 0) return [];

  const pipe = r.pipeline();
  for (const id of ids) {
    pipe.hgetall(`agent_run:${id}`);
  }
  const results = await pipe.exec();

  const runs: AgentRun[] = [];
  for (const [err, data] of results as Array<[Error | null, Record<string, string>]>) {
    if (err) continue;
    const run = fromRedisHash(data);
    if (run) runs.push(run);
  }

  // Sort by created_at descending
  runs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return runs;
}

/**
 * Get all agent runs for a specific job.
 */
export async function getAgentRunsForJob(
  r: Redis,
  board: string,
  jobId: string,
): Promise<AgentRun[]> {
  const ids = await r.smembers(`idx:agent_runs:job:${board}:${jobId}`);
  if (ids.length === 0) return [];

  const pipe = r.pipeline();
  for (const id of ids) {
    pipe.hgetall(`agent_run:${id}`);
  }
  const results = await pipe.exec();

  const runs: AgentRun[] = [];
  for (const [err, data] of results as Array<[Error | null, Record<string, string>]>) {
    if (err) continue;
    const run = fromRedisHash(data);
    if (run) runs.push(run);
  }

  runs.sort((a, b) => b.attempt - a.attempt);
  return runs;
}

/**
 * Atomically claim the oldest pending run from the queue.
 * Uses ZPOPMIN on the FIFO queue for atomic dequeue.
 */
export async function claimAgentRun(
  r: Redis,
  workerId: string,
): Promise<AgentRun | null> {
  // Atomically pop the oldest entry from the queue
  const popped = await r.zpopmin("queue:agent_runs", 1);
  if (!popped || popped.length === 0) return null;

  const executionId = popped[0]; // [member, score]
  const existing = await getAgentRun(r, executionId);
  if (!existing || existing.status !== "pending") {
    // Already claimed or gone — try the next one (recursive, bounded by queue size)
    return claimAgentRun(r, workerId);
  }

  const now = new Date().toISOString();
  const claimed: AgentRun = {
    ...existing,
    status: "running",
    worker_id: workerId,
    started_at: now,
    heartbeat_at: now,
    updated_at: now,
  };

  const pipe = r.pipeline();
  pipe.hset(`agent_run:${executionId}`, toRedisHash(claimed));
  pipe.srem("idx:agent_runs:status:pending", executionId);
  pipe.sadd("idx:agent_runs:status:running", executionId);
  await pipe.exec();

  return claimed;
}

/**
 * Requeue a failed run — resets it to pending with incremented attempt.
 */
export async function requeueAgentRun(
  r: Redis,
  executionId: string,
): Promise<AgentRun | null> {
  const existing = await getAgentRun(r, executionId);
  if (!existing) return null;

  const now = new Date().toISOString();
  const requeued: AgentRun = {
    ...existing,
    status: "pending",
    attempt: existing.attempt + 1,
    worker_id: null,
    heartbeat_at: null,
    started_at: null,
    completed_at: null,
    updated_at: now,
    error: null,
    artifacts: null,
  };

  const pipe = r.pipeline();
  pipe.hset(`agent_run:${executionId}`, toRedisHash(requeued));
  pipe.srem(`idx:agent_runs:status:${existing.status}`, executionId);
  pipe.sadd("idx:agent_runs:status:pending", executionId);
  pipe.zadd("queue:agent_runs", String(Date.now()), executionId);
  await pipe.exec();

  return requeued;
}

/**
 * Reap stale runs — find "running" runs with no heartbeat for `timeoutMs`
 * and requeue them. Returns the runs that were requeued.
 */
export async function reapStaleRuns(
  r: Redis,
  timeoutMs: number = 5 * 60 * 1000, // default 5 minutes
): Promise<AgentRun[]> {
  const runningIds = await r.smembers("idx:agent_runs:status:running");
  if (runningIds.length === 0) return [];

  const pipe = r.pipeline();
  for (const id of runningIds) {
    pipe.hgetall(`agent_run:${id}`);
  }
  const results = await pipe.exec();

  const now = Date.now();
  const stale: AgentRun[] = [];

  for (const [err, data] of results as Array<[Error | null, Record<string, string>]>) {
    if (err) continue;
    const run = fromRedisHash(data);
    if (!run) continue;

    // Use heartbeat_at if available, otherwise started_at
    const lastAlive = run.heartbeat_at || run.started_at || run.updated_at;
    if (!lastAlive) continue;

    const elapsed = now - new Date(lastAlive).getTime();
    if (elapsed > timeoutMs) {
      const requeued = await requeueAgentRun(r, run.execution_id);
      if (requeued) stale.push(requeued);
    }
  }

  return stale;
}

/**
 * Get queue depth — how many runs are waiting to be claimed.
 */
export async function getQueueDepth(r: Redis): Promise<number> {
  return r.zcard("queue:agent_runs");
}
