import type Redis from "ioredis";
import type { Company } from "../config/companies.js";
import type { UnifiedJob, JobNotification, DiffStats } from "./types.js";
import type { RelevanceResult } from "./relevance-scorer.js";
import { normalizeLocation, normalizeDepartment } from "./normalize.js";
import { extractTags } from "./tags.js";
import { getCompanySectors } from "../config/sectors.js";
import { createHash } from "crypto";

const REMOVED_TTL_DAYS = 90;

function contentHash(title: string, location: string, dept: string): string {
  return createHash("sha256")
    .update(`${title}|${location}|${dept}`)
    .digest("hex")
    .slice(0, 16);
}

export async function diffAndUpdate(
  r: Redis,
  company: Company,
  apiJobs: UnifiedJob[],
  scoredResults?: Map<string, RelevanceResult>,
): Promise<{ stats: DiffStats; notifications: JobNotification[] }> {
  const { boardToken, displayName } = company;
  const now = new Date();
  const nowTs = now.getTime() / 1000;
  const nowIso = now.toISOString();
  const notifications: JobNotification[] = [];
  const stats: DiffStats = { newCount: 0, updatedCount: 0, removedCount: 0, unchangedCount: 0 };

  const apiJobIds = new Set<string>();
  const pipe = r.pipeline();

  for (const job of apiJobs) {
    const jobId = job.id;
    const compositeKey = `${boardToken}:${jobId}`;
    const hashKey = `jobs:${boardToken}:${jobId}`;
    apiJobIds.add(compositeKey);

    const title = job.title;
    const url = job.url;
    const locationRaw = job.location;
    const dept = job.department;
    const updated = job.updated_at || nowIso;

    const hash = contentHash(title, locationRaw, dept);
    const scored = scoredResults?.get(jobId);
    const tags = scored && scored.matchedTags.length > 0
      ? new Set(scored.matchedTags)
      : extractTags(title, dept);
    // Merge company-level sector tags (e.g. "finance")
    for (const sector of getCompanySectors(boardToken)) {
      tags.add(sector);
    }
    const normLoc = normalizeLocation(locationRaw);
    const normDept = normalizeDepartment(dept);

    const existingHash = await r.hget(hashKey, "content_hash");

    if (existingHash === null) {
      // ── NEW JOB ──
      stats.newCount++;

      pipe.hset(hashKey, {
        job_id: jobId,
        company: boardToken,
        company_name: displayName,
        title,
        url,
        department: dept,
        location: locationRaw,
        status: "active",
        first_seen_at: nowIso,
        last_seen_at: nowIso,
        updated_at: updated,
        content_hash: hash,
        tags: [...tags].sort().join(","),
      });

      pipe.sadd(`idx:company:${boardToken}`, compositeKey);
      pipe.sadd(`idx:dept:${normDept}`, compositeKey);
      pipe.sadd(`idx:location:${normLoc}`, compositeKey);
      pipe.sadd("idx:status:active", compositeKey);
      for (const tag of tags) {
        pipe.sadd(`idx:tag:${tag}`, compositeKey);
      }

      pipe.zadd("feed:new", nowTs.toString(), compositeKey);
      pipe.zadd(`feed:company:${boardToken}`, nowTs.toString(), compositeKey);

      notifications.push({
        event: "NEW_JOB",
        company: boardToken,
        companyName: displayName,
        title,
        url,
        location: locationRaw,
        department: dept,
        tags: [...tags],
        timestamp: nowIso,
      });
    } else if (existingHash !== hash) {
      // ── UPDATED JOB ──
      stats.updatedCount++;

      const oldDept = (await r.hget(hashKey, "department")) || "";
      const oldLoc = (await r.hget(hashKey, "location")) || "";
      const oldTags = ((await r.hget(hashKey, "tags")) || "").split(",").filter(Boolean);
      const oldNormDept = normalizeDepartment(oldDept);
      const oldNormLoc = normalizeLocation(oldLoc);
      // Preserve user-set statuses (applying, applied) — don't overwrite
      const existingStatus = (await r.hget(hashKey, "status")) || "active";
      const preserveStatus = existingStatus === "applying" || existingStatus === "applied";

      if (oldNormDept !== normDept) pipe.srem(`idx:dept:${oldNormDept}`, compositeKey);
      if (oldNormLoc !== normLoc) pipe.srem(`idx:location:${oldNormLoc}`, compositeKey);
      for (const oldTag of oldTags) {
        if (!tags.has(oldTag)) pipe.srem(`idx:tag:${oldTag}`, compositeKey);
      }

      const updateFields: Record<string, string> = {
        title,
        url,
        department: dept,
        location: locationRaw,
        last_seen_at: nowIso,
        updated_at: updated,
        content_hash: hash,
        tags: [...tags].sort().join(","),
      };
      // Only reset to active if status wasn't set by agent/user
      if (!preserveStatus) {
        updateFields.status = "active";
      }
      pipe.hset(hashKey, updateFields);

      pipe.sadd(`idx:dept:${normDept}`, compositeKey);
      pipe.sadd(`idx:location:${normLoc}`, compositeKey);
      if (!preserveStatus) {
        pipe.sadd("idx:status:active", compositeKey);
      }
      for (const tag of tags) {
        pipe.sadd(`idx:tag:${tag}`, compositeKey);
      }
    } else {
      // ── UNCHANGED ──
      stats.unchangedCount++;
      // Re-sync tags (picks up new sector tags, tag logic changes)
      const oldTagStr = (await r.hget(hashKey, "tags")) || "";
      const newTagStr = [...tags].sort().join(",");
      if (oldTagStr !== newTagStr) {
        const oldTags = oldTagStr.split(",").filter(Boolean);
        for (const oldTag of oldTags) {
          if (!tags.has(oldTag)) pipe.srem(`idx:tag:${oldTag}`, compositeKey);
        }
        for (const tag of tags) {
          pipe.sadd(`idx:tag:${tag}`, compositeKey);
        }
        pipe.hset(hashKey, { last_seen_at: nowIso, tags: newTagStr });
      } else {
        pipe.hset(hashKey, "last_seen_at", nowIso);
      }
    }
  }

  // ── Detect REMOVED jobs ──
  const companyJobs = await r.smembers(`idx:company:${boardToken}`);
  const activeJobs = await r.smembers("idx:status:active");
  const applyingJobs = await r.smembers("idx:status:applying");
  const appliedJobs = await r.smembers("idx:status:applied");
  const liveSet = new Set([...activeJobs, ...applyingJobs, ...appliedJobs]);

  for (const compositeKey of companyJobs) {
    if (!liveSet.has(compositeKey)) continue;
    if (apiJobIds.has(compositeKey)) continue;

    stats.removedCount++;
    const [, removedJobId] = compositeKey.split(":", 2);
    const hashKey = `jobs:${boardToken}:${removedJobId}`;

    const removedTitle = (await r.hget(hashKey, "title")) || "Unknown";
    const removedUrl = (await r.hget(hashKey, "url")) || "";

    pipe.hset(hashKey, { status: "removed", removed_at: nowIso });
    pipe.srem("idx:status:active", compositeKey);
    pipe.sadd("idx:status:removed", compositeKey);
    pipe.zadd("feed:removed", nowTs.toString(), compositeKey);
    pipe.expire(hashKey, REMOVED_TTL_DAYS * 86400);

    notifications.push({
      event: "REMOVED_JOB",
      company: boardToken,
      companyName: displayName,
      title: removedTitle,
      url: removedUrl,
      location: "",
      department: "",
      tags: [],
      timestamp: nowIso,
    });
  }

  await pipe.exec();

  // Update metadata
  await r.set(`meta:last_fetch:${boardToken}`, nowIso);
  await r.sadd("meta:companies", boardToken);
  const totalSeen = await r.scard(`idx:company:${boardToken}`);
  await r.hset(`stats:company:${boardToken}`, {
    active: String(apiJobIds.size),
    total_seen: String(totalSeen),
    last_fetch: nowIso,
    last_new: String(stats.newCount),
    last_removed: String(stats.removedCount),
  });

  return { stats, notifications };
}
