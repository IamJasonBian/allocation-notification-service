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
