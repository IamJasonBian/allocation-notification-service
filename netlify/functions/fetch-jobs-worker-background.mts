import { companies } from "../../src/config/companies.js";
import { getRedisClient, disconnectRedis } from "../../src/lib/redis.js";
import { fetchJobs } from "../../src/lib/job-fetcher.js";
import { diffAndUpdate } from "../../src/lib/differ.js";
import { sendNotificationDigest } from "../../src/lib/notifier.js";
import { getAllActiveTags } from "../../src/lib/tag-store.js";
import { scoreJob } from "../../src/lib/relevance-scorer.js";
import type { JobNotification } from "../../src/lib/types.js";
import type { RelevanceResult } from "../../src/lib/relevance-scorer.js";
import { randomUUID } from "crypto";

/**
 * Background function (15-min timeout).
 * Named with -background suffix so Netlify returns 202 immediately.
 *
 * Processes all tracked companies:
 * 1. Fetches jobs from ATS APIs
 * 2. Scores against relevance tags (beam search filter)
 * 3. Diffs against Redis state
 * 4. Updates Redis indexes
 * 5. Sends SMS digest of new/removed jobs
 * 6. Records crawl run stats
 */
export default async (req: Request) => {
  const redis = getRedisClient();
  const allNotifications: JobNotification[] = [];

  // Crawl run tracking
  const runId = randomUUID();
  const startTime = Date.now();
  const startIso = new Date(startTime).toISOString();
  let runStatus = "completed";
  let runError = "";

  let totalFetched = 0, totalRelevant = 0, totalNew = 0;
  let totalUpdated = 0, totalRemoved = 0, totalUnchanged = 0;
  let boardsOk = 0, boardsError = 0;
  let activeCompaniesCount = 0;

  try {
    await redis.ping();
    console.log("Redis connected");

    // Record run as started
    await redis.hset(`crawl_run:${runId}`, {
      run_id: runId,
      started_at: startIso,
      status: "running",
      trigger: "scheduled",
    });
    await redis.zadd("idx:crawl_runs", String(startTime / 1000), runId);

    // Load relevance filter tags
    const activeTags = await getAllActiveTags(redis);
    const scoringEnabled = activeTags.length > 0;
    if (scoringEnabled) {
      console.log(`Relevance filter active: ${activeTags.length} tags (${activeTags.map((t) => t.title).join(", ")})`);
    } else {
      console.log("No relevance tags defined — storing all jobs");
    }

    // Filter out companies that were archived/removed
    const removedSet = await redis.smembers("meta:removed_companies");
    const removedTokens = new Set(removedSet);
    const activeCompanies = companies.filter((c) => !removedTokens.has(c.boardToken));
    activeCompaniesCount = activeCompanies.length;
    if (removedTokens.size > 0) {
      console.log(`Skipping ${removedTokens.size} removed companies: ${[...removedTokens].join(", ")}`);
    }

    for (const company of activeCompanies) {
      const atsType = company.atsType || "greenhouse";
      console.log(`Processing ${company.displayName} (${company.boardToken}, ${atsType})...`);

      try {
        const apiJobs = await fetchJobs(company);
        if (apiJobs.length === 0) {
          console.log(`  No jobs returned for ${company.boardToken}, skipping`);
          boardsOk++;
          continue;
        }

        // Beam search relevance filter
        let jobsToStore = apiJobs;
        let scoredMap: Map<string, RelevanceResult> | undefined;
        if (scoringEnabled) {
          scoredMap = new Map();
          jobsToStore = apiJobs.filter((job) => {
            const result = scoreJob(job, activeTags);
            scoredMap!.set(job.id, result);
            return result.relevant;
          });
          console.log(`  ${company.boardToken}: ${apiJobs.length} fetched → ${jobsToStore.length} relevant (${apiJobs.length - jobsToStore.length} filtered)`);
        }

        const { stats, notifications } = await diffAndUpdate(redis, company, jobsToStore, scoredMap);
        allNotifications.push(...notifications);

        totalFetched += apiJobs.length;
        totalRelevant += jobsToStore.length;
        totalNew += stats.newCount;
        totalUpdated += stats.updatedCount;
        totalRemoved += stats.removedCount;
        totalUnchanged += stats.unchangedCount;
        boardsOk++;

        console.log(`  ${company.boardToken}: new=${stats.newCount} updated=${stats.updatedCount} removed=${stats.removedCount} unchanged=${stats.unchangedCount}`);
      } catch (companyErr: any) {
        boardsError++;
        console.error(`  Error processing ${company.boardToken}: ${companyErr.message}`);
      }

      // Be polite to ATS APIs
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // Prune old feed entries (older than 6 months)
    const sixMonthsAgo = Date.now() / 1000 - 180 * 86400;
    await redis.zremrangebyscore("feed:new", "-inf", sixMonthsAgo);
    await redis.zremrangebyscore("feed:removed", "-inf", sixMonthsAgo);

    // Send SMS digest
    if (allNotifications.length > 0) {
      console.log(`Sending SMS digest with ${allNotifications.length} notifications`);
      await sendNotificationDigest(allNotifications);
    } else {
      console.log("No new notifications to send");
    }

    console.log(`Done. Processed ${activeCompanies.length} companies, ${allNotifications.length} notifications`);
  } catch (err: any) {
    runStatus = "failed";
    runError = err.message;
    console.error("Crawl run failed:", err);
  } finally {
    // Finalize crawl run record
    const endTime = Date.now();
    try {
      await redis.hset(`crawl_run:${runId}`, {
        completed_at: new Date(endTime).toISOString(),
        status: runStatus,
        boards_total: String(activeCompaniesCount),
        boards_ok: String(boardsOk),
        boards_error: String(boardsError),
        jobs_fetched: String(totalFetched),
        jobs_relevant: String(totalRelevant),
        jobs_new: String(totalNew),
        jobs_updated: String(totalUpdated),
        jobs_removed: String(totalRemoved),
        jobs_unchanged: String(totalUnchanged),
        duration_ms: String(endTime - startTime),
        ...(runError ? { error: runError } : {}),
      });
    } catch { /* best effort */ }

    await disconnectRedis();
  }
};
