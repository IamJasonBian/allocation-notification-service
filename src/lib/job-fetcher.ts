import type { Company } from "../config/companies.js";
import type { GreenhouseJob, LeverJob, AshbyJob, UnifiedJob } from "./types.js";
import { fetchGreenhouseJobs } from "./greenhouse.js";
import { fetchLeverJobs } from "./lever.js";
import { fetchAshbyJobs } from "./ashby.js";

/**
 * Normalize Greenhouse job to UnifiedJob format
 */
function normalizeGreenhouseJob(job: GreenhouseJob): UnifiedJob {
  return {
    id: String(job.id),
    title: job.title,
    url: job.absolute_url,
    updated_at: job.updated_at,
    location: job.location?.name || "Unknown",
    department: job.departments?.[0]?.name || "General",
  };
}

/**
 * Normalize Lever job to UnifiedJob format
 */
function normalizeLeverJob(job: LeverJob): UnifiedJob {
  // Lever uses createdAt timestamp (ms), convert to ISO string
  const updatedAt = new Date(job.createdAt).toISOString();

  return {
    id: job.id,
    title: job.text,
    url: job.hostedUrl,
    updated_at: updatedAt,
    location: job.categories?.location || "Unknown",
    department: job.categories?.department || job.categories?.team || "General",
  };
}

/**
 * Normalize Ashby job to UnifiedJob format
 */
function normalizeAshbyJob(job: AshbyJob): UnifiedJob {
  return {
    id: job.id,
    title: job.title,
    url: job.jobUrl,
    updated_at: job.publishedAt,
    location: job.location || "Unknown",
    department: job.department || job.team || "General",
  };
}

/**
 * Fetch jobs from any ATS platform and normalize to UnifiedJob format
 */
export async function fetchJobs(company: Company): Promise<UnifiedJob[]> {
  const atsType = company.atsType || "greenhouse"; // default to greenhouse for backward compat

  try {
    switch (atsType) {
      case "greenhouse": {
        const jobs = await fetchGreenhouseJobs(company.boardToken);
        return jobs.map(normalizeGreenhouseJob);
      }

      case "lever": {
        const jobs = await fetchLeverJobs(company.boardToken);
        return jobs.map(normalizeLeverJob);
      }

      case "ashby": {
        const jobs = await fetchAshbyJobs(company.boardToken);
        return jobs.map(normalizeAshbyJob);
      }

      default:
        console.warn(`Unknown ATS type: ${atsType} for ${company.displayName}`);
        return [];
    }
  } catch (error) {
    console.error(`Failed to fetch jobs for ${company.displayName} (${atsType}):`, error);
    return [];
  }
}
