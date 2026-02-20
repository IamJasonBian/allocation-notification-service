import type { AshbyJob, AshbyResponse } from "./types.js";

const BASE_URL = "https://api.ashbyhq.com/posting-api/job-board";

export async function fetchAshbyJobs(boardToken: string): Promise<AshbyJob[]> {
  const url = `${BASE_URL}/${boardToken}?includeCompensation=true`;

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      console.warn(`Ashby returned ${response.status} for ${boardToken}`);
      return [];
    }

    const data = (await response.json()) as AshbyResponse;
    return data.jobs || [];
  } catch (error) {
    console.error(`Failed to fetch Ashby ${boardToken}:`, error);
    return [];
  }
}
