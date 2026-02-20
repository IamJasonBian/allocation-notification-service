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
