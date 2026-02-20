import type { Config } from "@netlify/functions";
import { companies } from "../../src/config/companies.js";
import { getRedisClient, disconnectRedis } from "../../src/lib/redis.js";

function careerPageUrl(boardToken: string, atsType: string): string {
  switch (atsType) {
    case "lever": return `https://jobs.lever.co/${boardToken}`;
    case "ashby": return `https://jobs.ashbyhq.com/${boardToken}`;
    default:      return `https://boards.greenhouse.io/${boardToken}`;
  }
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

/**
 * GET /api/companies
 * Returns all tracked companies with their ATS URLs.
 * Excludes companies in the `meta:removed_companies` Redis set.
 */
export default async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("", { status: 200, headers: CORS_HEADERS });
  }

  const redis = getRedisClient();

  try {
    const removedSet = await redis.smembers("meta:removed_companies");
    const removedTokens = new Set(removedSet);

    const companyList = companies
      .filter((c) => !removedTokens.has(c.boardToken))
      .map((c) => {
        const ats = c.atsType || "greenhouse";
        return {
          boardToken: c.boardToken,
          displayName: c.displayName,
          description: c.description,
          atsType: ats,
          careerPageUrl: careerPageUrl(c.boardToken, ats),
        };
      });

    return new Response(
      JSON.stringify({ count: companyList.length, companies: companyList }, null, 2),
      {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      },
    );
  } finally {
    await disconnectRedis();
  }
};

export const config: Config = {
  path: "/api/companies",
};
