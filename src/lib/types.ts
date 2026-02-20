export interface GreenhouseJob {
  id: number;
  title: string;
  absolute_url: string;
  updated_at: string;
  location: { name: string };
  departments?: Array<{ id: number; name: string }>;
  offices?: Array<{ id: number; name: string; location: string }>;
}

export interface GreenhouseResponse {
  jobs: GreenhouseJob[];
  meta?: { total: number };
}

export interface LeverJob {
  id: string;
  text: string; // job title
  hostedUrl: string;
  applyUrl: string;
  createdAt: number; // timestamp in ms
  categories: {
    commitment?: string;
    department?: string;
    location?: string;
    team?: string;
    allLocations?: string[];
  };
  workplaceType?: string;
}

export interface AshbyJob {
  id: string;
  title: string;
  jobUrl: string;
  applyUrl: string;
  publishedAt: string; // ISO timestamp
  department?: string;
  team?: string;
  location: string;
  secondaryLocations?: Array<{
    location: string;
    address?: { postalAddress?: Record<string, string> };
  }>;
  employmentType?: string;
  isRemote?: boolean;
  workplaceType?: string;
}

export interface AshbyResponse {
  jobs: AshbyJob[];
}

// Unified job interface used by differ
export interface UnifiedJob {
  id: string;
  title: string;
  url: string;
  updated_at: string;
  location: string;
  department: string;
}

export interface JobNotification {
  event: "NEW_JOB" | "REMOVED_JOB";
  company: string;
  companyName: string;
  title: string;
  url: string;
  location: string;
  department: string;
  tags: string[];
  timestamp: string;
}

export interface DiffStats {
  newCount: number;
  updatedCount: number;
  removedCount: number;
  unchangedCount: number;
}

// Re-export resume variant types
export type { ResumeVariant, Application, VariantStats } from "./resume-variants.js";

/* ── Auto-Apply Types ── */

export interface GreenhouseQuestionField {
  name: string;
  type: "input_text" | "textarea" | "input_file" | "multi_value_single_select" | "multi_value_multi_select";
  values: Array<{ label: string; value: number | string }>;
}

export interface GreenhouseQuestion {
  label: string;
  description: string | null;
  required: boolean;
  fields: GreenhouseQuestionField[];
}

export interface GreenhouseJobDetail extends GreenhouseJob {
  content: string;
  company_name: string;
  questions?: GreenhouseQuestion[];
  data_compliance?: Array<{ type: string; requires_consent: boolean; retention_period: number | null }>;
}

export interface ApplicationResult {
  success: boolean;
  jobId: number;
  boardToken: string;
  companyName: string;
  jobTitle: string;
  jobUrl: string;
  status: number;
  message: string;
  timestamp: string;
}

export interface JobMatch {
  job: GreenhouseJob;
  boardToken: string;
  companyName: string;
  score: number;
  matchReasons: string[];
}

export interface ApplicationStateRecord {
  metadata: {
    boardToken: string;
    jobId: number | string;
    companyName: string;
    candidateEmail: string;
    timestamp: string;
    success: boolean;
    message: string;
    securityCodeUsed?: string;
    finalUrl?: string;
    stepReached: "submitted" | "security_code_entered" | "confirmed" | "failed";
  };
  fieldValues: Record<string, string>;
  screenshotKeys: string[];
}
