import type { LeverJob } from "./types.js";

const BASE_URL = "https://api.lever.co/v0/postings";

export async function fetchLeverJobs(boardToken: string): Promise<LeverJob[]> {
  const url = `${BASE_URL}/${boardToken}`;

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      console.warn(`Lever returned ${response.status} for ${boardToken}`);
      return [];
    }

    const data = (await response.json()) as LeverJob[];
    return data || [];
  } catch (error) {
    console.error(`Failed to fetch Lever ${boardToken}:`, error);
    return [];
  }
}
