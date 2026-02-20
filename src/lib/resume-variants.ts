import type Redis from "ioredis";
import { createHash } from "crypto";

export interface ResumeVariant {
  id: string;
  name: string;
  file_path: string;
  created_at: string;
  file_hash: string;
}

export interface Application {
  job_id: string;
  company: string;
  company_name: string;
  job_title: string;
  job_url: string;
  resume_variant_id: string;
  applied_at: string;
  status: "pending" | "rejected" | "interview" | "offer" | "withdrawn";
  updated_at: string;
}

export interface VariantStats {
  variant_id: string;
  total_applications: number;
  pending: number;
  rejected: number;
  interviews: number;
  offers: number;
  withdrawn: number;
  response_rate: number;
  success_rate: number;
}

/**
 * Resume variants for A/B testing
 */
export const RESUME_VARIANTS: Omit<ResumeVariant, "file_hash" | "created_at">[] = [
  {
    id: "variant_1",
    name: "Resume v1",
    file_path: "/Users/jasonzb/Desktop/apollo/allocation-agent/blob/resume_jasonzb (1).pdf",
  },
  {
    id: "variant_2",
    name: "Resume v2",
    file_path: "/Users/jasonzb/Desktop/apollo/allocation-agent/blob/resume_jasonzb (2).pdf",
  },
  {
    id: "variant_3",
    name: "Resume v3",
    file_path: "/Users/jasonzb/Desktop/apollo/allocation-agent/blob/resume_jasonzb (3).pdf",
  },
  {
    id: "variant_4",
    name: "Resume v4",
    file_path: "/Users/jasonzb/Desktop/apollo/allocation-agent/blob/resume_jasonzb (4).pdf",
  },
  {
    id: "variant_5",
    name: "Resume v5 (Oct 10)",
    file_path: "/Users/jasonzb/Desktop/apollo/allocation-agent/blob/resume_jasonzb_oct10.pdf",
  },
  {
    id: "variant_6",
    name: "Resume v6 (Oct 15 M)",
    file_path: "/Users/jasonzb/Desktop/apollo/allocation-agent/blob/resume_jasonzb_oct15_m.pdf",
  },
];

/**
 * Select a random resume variant for A/B testing
 */
export function selectRandomVariant(): ResumeVariant {
  const variant = RESUME_VARIANTS[Math.floor(Math.random() * RESUME_VARIANTS.length)];
  return {
    ...variant,
    created_at: new Date().toISOString(),
    file_hash: createHash("md5").update(variant.file_path).digest("hex").slice(0, 8),
  };
}

/**
 * Store resume variant metadata in Redis
 */
export async function initializeVariants(r: Redis): Promise<void> {
  const pipe = r.pipeline();

  for (const variant of RESUME_VARIANTS) {
    const variantData: ResumeVariant = {
      ...variant,
      created_at: new Date().toISOString(),
      file_hash: createHash("md5").update(variant.file_path).digest("hex").slice(0, 8),
    };

    pipe.hset(`resume:variant:${variant.id}`, {
      id: variantData.id,
      name: variantData.name,
      file_path: variantData.file_path,
      created_at: variantData.created_at,
      file_hash: variantData.file_hash,
    });

    // Initialize stats if they don't exist
    pipe.hsetnx(`stats:resume_variant:${variant.id}`, "total_applications", "0");
    pipe.hsetnx(`stats:resume_variant:${variant.id}`, "pending", "0");
    pipe.hsetnx(`stats:resume_variant:${variant.id}`, "rejected", "0");
    pipe.hsetnx(`stats:resume_variant:${variant.id}`, "interviews", "0");
    pipe.hsetnx(`stats:resume_variant:${variant.id}`, "offers", "0");
    pipe.hsetnx(`stats:resume_variant:${variant.id}`, "withdrawn", "0");
  }

  // Store variant IDs in a set for easy retrieval
  pipe.sadd("meta:resume_variants", ...RESUME_VARIANTS.map((v) => v.id));

  await pipe.exec();
}

/**
 * Record a job application with resume variant
 */
export async function recordApplication(
  r: Redis,
  application: Omit<Application, "applied_at" | "updated_at" | "status">,
): Promise<void> {
  const now = new Date().toISOString();
  const appKey = `application:${application.company}:${application.job_id}`;

  const pipe = r.pipeline();

  // Store application record
  pipe.hset(appKey, {
    job_id: application.job_id,
    company: application.company,
    company_name: application.company_name,
    job_title: application.job_title,
    job_url: application.job_url,
    resume_variant_id: application.resume_variant_id,
    applied_at: now,
    status: "pending",
    updated_at: now,
  });

  // Add to indexes
  pipe.sadd(`idx:applications:company:${application.company}`, appKey);
  pipe.sadd(`idx:applications:variant:${application.resume_variant_id}`, appKey);
  pipe.zadd("feed:applications", Date.now() / 1000, appKey);

  // Increment variant stats
  pipe.hincrby(`stats:resume_variant:${application.resume_variant_id}`, "total_applications", 1);
  pipe.hincrby(`stats:resume_variant:${application.resume_variant_id}`, "pending", 1);

  await pipe.exec();
}

/**
 * Update application status
 */
export async function updateApplicationStatus(
  r: Redis,
  company: string,
  jobId: string,
  newStatus: Application["status"],
): Promise<void> {
  const appKey = `application:${company}:${jobId}`;
  const app = await r.hgetall(appKey);

  if (!app.resume_variant_id) {
    console.warn(`Application ${appKey} not found or missing variant_id`);
    return;
  }

  const oldStatus = app.status as Application["status"];
  const variantId = app.resume_variant_id;

  const pipe = r.pipeline();

  // Update application status
  pipe.hset(appKey, {
    status: newStatus,
    updated_at: new Date().toISOString(),
  });

  // Update variant stats (decrement old status, increment new status)
  if (oldStatus) {
    pipe.hincrby(`stats:resume_variant:${variantId}`, oldStatus, -1);
  }
  pipe.hincrby(`stats:resume_variant:${variantId}`, newStatus, 1);

  await pipe.exec();
}

/**
 * Get statistics for a resume variant
 */
export async function getVariantStats(r: Redis, variantId: string): Promise<VariantStats> {
  const stats = await r.hgetall(`stats:resume_variant:${variantId}`);

  const total = parseInt(stats.total_applications || "0", 10);
  const pending = parseInt(stats.pending || "0", 10);
  const rejected = parseInt(stats.rejected || "0", 10);
  const interviews = parseInt(stats.interviews || "0", 10);
  const offers = parseInt(stats.offers || "0", 10);
  const withdrawn = parseInt(stats.withdrawn || "0", 10);

  const responded = rejected + interviews + offers;
  const responseRate = total > 0 ? responded / total : 0;
  const successRate = total > 0 ? (interviews + offers) / total : 0;

  return {
    variant_id: variantId,
    total_applications: total,
    pending,
    rejected,
    interviews,
    offers,
    withdrawn,
    response_rate: Math.round(responseRate * 1000) / 1000,
    success_rate: Math.round(successRate * 1000) / 1000,
  };
}

/**
 * Get all variant statistics for A/B comparison
 */
export async function getAllVariantStats(r: Redis): Promise<VariantStats[]> {
  const variantIds = await r.smembers("meta:resume_variants");
  return Promise.all(variantIds.map((id) => getVariantStats(r, id)));
}

/**
 * Get all applications for a specific variant
 */
export async function getVariantApplications(r: Redis, variantId: string): Promise<Application[]> {
  const appKeys = await r.smembers(`idx:applications:variant:${variantId}`);
  const applications: Application[] = [];

  for (const key of appKeys) {
    const app = await r.hgetall(key);
    if (app.job_id) {
      applications.push(app as unknown as Application);
    }
  }

  return applications;
}
