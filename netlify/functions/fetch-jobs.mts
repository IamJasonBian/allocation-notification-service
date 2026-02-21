import type { Config } from "@netlify/functions";

/**
 * Scheduled function — runs on a cron schedule.
 * Fires a POST to the background worker function, which has a 15-min timeout.
 */
export default async (req: Request) => {
  // Scheduled job fetching is disabled — use scripts/refresh-jobs.mjs for manual runs
  console.log("Scheduled fetch-jobs is disabled");
  return new Response("Disabled", { status: 200 });
};

// Schedule disabled — uncomment to re-enable
// export const config: Config = {
//   schedule: "0 */6 * * *",
// };
